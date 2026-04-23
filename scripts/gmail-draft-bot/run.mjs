#!/usr/bin/env node
// Gmail draft bot orchestrator — implements the v2 spec:
//   Phase 0: learn style from recent sent mail
//   Phase 1: fetch unread threads (< 1 day old)
//   Phase 2: pre-filter obvious skips (noreply, newsletters, secrets, self-last)
//   Phase 3: per-thread classification + draft generation
//   Phase 4: log outcome to Notion
//
// Required env:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//   ANTHROPIC_API_KEY
//   NOTION_TOKEN, NOTION_GMAIL_LOG_DB_ID
// Optional env:
//   CLAUDE_MODEL (default: claude-sonnet-4-6)
//   DRY_RUN=1   — skip Gmail draft creation; still logs to Notion
//   USER_EMAIL  — override primary calendar ID; default 'primary'

import { getAccessToken } from './oauth.mjs';
import {
  listMessages, getMessage, getThread, listRecentSent,
  decodePlainText, getHeader, parseFromHeader, buildRawMessage, createDraft,
} from './gmail.mjs';
import { suggestTimes, formatSlotsJa, formatSlotsEn } from './calendar.mjs';
import { appendLog } from './notion.mjs';
import { learnStyle, classify, generateDraft } from './claude.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';

// --- Phase 2 filter rules ------------------------------------------------

const NOREPLY_PATTERNS = [
  /noreply/i, /no-reply/i, /donotreply/i,
  /notifications?@/i, /newsletter@/i, /mailer-daemon/i, /postmaster@/i,
];
const SUBJECT_SKIP_PATTERNS = [
  /\[配信停止\]/i, /unsubscribe/i, /auto[- ]?reply/i, /out of office/i,
];
// Machine-detectable secrets. If any match, the draft is suppressed and the
// message is logged with reason — the bot should never echo secrets back.
const SECRET_PATTERNS = [
  { name: 'credit-card', re: /\b(?:\d[ -]*?){13,16}\b/ },
  { name: 'my-number', re: /\b\d{4}\s*\d{4}\s*\d{4}\b/ },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'api-key-sk', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'api-key-gh', re: /ghp_[A-Za-z0-9]{36}/ },
];

function shouldSkipSender(fromEmail) {
  return NOREPLY_PATTERNS.some(re => re.test(fromEmail));
}

function shouldSkipSubject(subject) {
  return SUBJECT_SKIP_PATTERNS.some(re => re.test(subject));
}

function detectSecret(body) {
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(body)) return name;
  }
  return null;
}

// --- Phase 3 language + category helpers ---------------------------------

function detectLanguage(text) {
  const sample = text.slice(0, 400).replace(/\s/g, '');
  if (!sample) return 'other';
  const jpChars = (sample.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
  const asciiLetters = (sample.match(/[A-Za-z]/g) ?? []).length;
  if (jpChars / sample.length >= 0.3) return 'ja';
  if (asciiLetters / sample.length >= 0.8) return 'en';
  return 'other';
}

function hasPdfAttachment(payload) {
  if (!payload) return false;
  const stack = [payload];
  while (stack.length) {
    const p = stack.shift();
    const mime = (p.mimeType ?? '').toLowerCase();
    const name = p.filename ?? '';
    if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return true;
    if (p.parts) stack.push(...p.parts);
  }
  return false;
}

// Compact thread text Claude sees — drops headers we don't need.
function serializeThread(thread) {
  const parts = [];
  for (const msg of thread.messages ?? []) {
    const h = msg.payload?.headers ?? [];
    const from = getHeader(h, 'From');
    const date = getHeader(h, 'Date');
    const body = decodePlainText(msg.payload).slice(0, 8000);
    parts.push(`From: ${from}\nDate: ${date}\n\n${body}`);
  }
  return parts.join('\n\n---\n\n');
}

// --- orchestration -------------------------------------------------------

async function main() {
  const accessToken = await getAccessToken();
  const myEmail = process.env.USER_EMAIL ?? null;
  const notionDb = requireEnv('NOTION_GMAIL_LOG_DB_ID');
  const notionToken = requireEnv('NOTION_TOKEN');

  console.log('[phase0] learning style from recent sent mail...');
  const sent = await listRecentSent(accessToken, { days: 30, pageSize: 30 });
  const styleProfile = await learnStyle(sent);
  console.log(`[phase0] profile: ${styleProfile.honorificLevel}, emoji=${styleProfile.usesEmoji}`);

  console.log('[phase1] fetching unread messages...');
  const q = 'is:unread newer_than:1d -in:spam -in:trash -category:promotions -category:social -category:updates';
  const unread = await listMessages(accessToken, { q, maxResults: 30 });
  console.log(`[phase1] found ${unread.length} unread messages`);

  // Collapse messages into unique threads, remembering the newest message id
  // for each so we can pre-filter without a full get_thread round-trip.
  const threadIds = [];
  const seen = new Set();
  for (const { id, threadId } of unread) {
    if (seen.has(threadId)) continue;
    seen.add(threadId);
    threadIds.push({ threadId, messageId: id });
  }

  const results = [];
  for (const { threadId, messageId } of threadIds) {
    try {
      const outcome = await processThread({
        accessToken, threadId, messageId, styleProfile, myEmail,
      });
      results.push(outcome);
    } catch (err) {
      console.error(`[error] thread=${threadId}: ${err.message}`);
      results.push({
        threadId,
        status: 'エラー',
        skipReason: err.message.slice(0, 500),
        processedAt: new Date().toISOString(),
        subject: '(error)',
      });
    }
  }

  console.log(`[phase4] logging ${results.length} outcomes to Notion...`);
  // Log every drafted/VIP/error row; log only the first 3 skip rows to keep
  // the database scannable.
  const skipRows = results.filter(r => r.status === 'スキップ').slice(0, 3);
  const nonSkip = results.filter(r => r.status !== 'スキップ');
  for (const row of [...nonSkip, ...skipRows]) {
    try {
      await appendLog(notionToken, notionDb, row);
    } catch (err) {
      console.error(`[notion] ${err.message}`);
    }
  }

  const summary = summarize(results);
  console.log(`[done] ${summary}`);
}

async function processThread({ accessToken, threadId, messageId, styleProfile, myEmail }) {
  const processedAt = new Date().toISOString();
  // Cheap metadata pass first so we can skip without paying for the whole thread.
  const meta = await getMessage(accessToken, messageId, 'metadata');
  const headers = meta.payload?.headers ?? [];
  const subject = getHeader(headers, 'Subject') || '(no subject)';
  const fromHeader = getHeader(headers, 'From');
  const { name: fromName, email: fromEmail } = parseFromHeader(fromHeader);

  if (shouldSkipSender(fromEmail)) {
    return skipRow({ threadId, subject, fromName, fromEmail, processedAt, reason: 'noreply sender' });
  }
  if (shouldSkipSubject(subject)) {
    return skipRow({ threadId, subject, fromName, fromEmail, processedAt, reason: 'subject indicates automated/notification mail' });
  }

  // Full thread for language detection, self-last check, attachment scan.
  const thread = await getThread(accessToken, threadId);
  const msgs = thread.messages ?? [];
  if (!msgs.length) {
    return skipRow({ threadId, subject, fromName, fromEmail, processedAt, reason: 'empty thread' });
  }
  const lastMsg = msgs[msgs.length - 1];
  const lastFrom = parseFromHeader(getHeader(lastMsg.payload?.headers ?? [], 'From'));
  if (myEmail && lastFrom.email.toLowerCase() === myEmail.toLowerCase()) {
    return skipRow({ threadId, subject, fromName, fromEmail, processedAt, reason: 'I sent the most recent message' });
  }

  const latestBody = decodePlainText(lastMsg.payload);
  const secret = detectSecret(latestBody);
  if (secret) {
    return skipRow({
      threadId, subject, fromName, fromEmail, processedAt,
      reason: `secret-like pattern detected: ${secret}`,
    });
  }

  const language = detectLanguage(latestBody || subject);
  if (language === 'other') {
    return {
      threadId, subject, fromName, fromEmail, processedAt,
      status: 'スキップ',
      language: 'その他',
      confidence: 1,
      skipReason: 'language not supported (neither ja nor en)',
    };
  }

  const category = await classify({
    subject,
    fromName: fromName || fromEmail,
    snippet: latestBody,
    language,
  });

  let schedulingBlock = null;
  if (category === 'SCHEDULING') {
    try {
      const slots = await suggestTimes(accessToken, {
        attendees: ['primary', fromEmail].filter(Boolean),
        durationMinutes: inferDuration(latestBody),
        limit: 3,
      });
      if (slots.length) {
        schedulingBlock = language === 'en' ? formatSlotsEn(slots) : formatSlotsJa(slots);
      }
    } catch (err) {
      console.warn(`[calendar] ${err.message}`);
    }
  }

  if (hasPdfAttachment(lastMsg.payload) && category !== 'SCHEDULING') {
    // Upgrade category so the prompt picks the PDF-specific template even if
    // classify() returned NORMAL.
    if (category !== 'VIP') {
      return await draftAndReturn({
        accessToken, threadId, subject, fromName, fromEmail,
        language, category: 'PDF_ATTACHMENT', thread, styleProfile,
        schedulingBlock, processedAt,
      });
    }
  }

  return await draftAndReturn({
    accessToken, threadId, subject, fromName, fromEmail,
    language, category, thread, styleProfile,
    schedulingBlock, processedAt,
  });
}

async function draftAndReturn({
  accessToken, threadId, subject, fromName, fromEmail,
  language, category, thread, styleProfile, schedulingBlock, processedAt,
}) {
  const threadContext = serializeThread(thread);
  const { body, confidence } = await generateDraft({
    styleProfile,
    threadContext,
    language,
    category,
    schedulingBlock,
  });

  const finalBody = ensureMarker(body);

  let draftId = '';
  let status = category === 'VIP' ? 'VIP要対応' : '下書き作成';
  if (!DRY_RUN) {
    const raw = buildRawMessage({
      to: fromEmail,
      subject: subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`,
      inReplyTo: extractMessageId(thread),
      references: extractMessageId(thread),
      bodyText: finalBody,
    });
    const draft = await createDraft(accessToken, { threadId, raw });
    draftId = draft.id ?? '';
  }

  return {
    threadId,
    draftId,
    subject,
    fromName,
    fromEmail,
    processedAt,
    language: languageLabel(language),
    category: categoryLabel(category),
    status,
    confidence,
    draftBody: finalBody,
  };
}

// --- helpers -------------------------------------------------------------

function skipRow({ threadId, subject, fromName, fromEmail, processedAt, reason }) {
  return {
    threadId,
    subject,
    fromName,
    fromEmail,
    processedAt,
    status: 'スキップ',
    skipReason: reason,
    confidence: null,
  };
}

function ensureMarker(body) {
  const marker = '<!-- AI_DRAFT v2 -->';
  return body.includes(marker) ? body : `${body.trimEnd()}\n\n${marker}`;
}

function extractMessageId(thread) {
  const last = (thread.messages ?? []).at(-1);
  if (!last) return '';
  return getHeader(last.payload?.headers ?? [], 'Message-ID');
}

function inferDuration(body) {
  // Very cheap heuristic — body typically says "30分", "1時間", "30 min".
  if (/30\s*(?:分|min)/i.test(body)) return 30;
  if (/(?:2\s*時間|2\s*hours?)/i.test(body)) return 120;
  if (/(?:90\s*分|1\.5\s*hours?)/i.test(body)) return 90;
  return 60;
}

function languageLabel(code) {
  return code === 'ja' ? '日本語' : code === 'en' ? '英語' : 'その他';
}

function categoryLabel(cat) {
  return {
    SCHEDULING: '日程調整',
    PDF_ATTACHMENT: 'PDF添付あり',
    VIP: 'VIP要対応',
    QUESTION: '質問',
    NORMAL: '通常返信',
  }[cat] ?? 'その他';
}

function summarize(results) {
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ');
}

function requireEnv(k) {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env: ${k}`);
  return v;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
