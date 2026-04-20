#!/usr/bin/env node
// Nightly orchestrator: runs sections C/D/E/F, builds a markdown report,
// and posts it to Notion as a child page of NOTION_PARENT_PAGE_ID.
//
// Required env:
//   VERCEL_TOKEN, VERCEL_TEAM_ID, NOTION_TOKEN, NOTION_PARENT_PAGE_ID
// Optional env:
//   ANTHROPIC_API_KEY (enables section E review)
//   VERCEL_APP_NAME (default: lumenium-app)

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const env = (k, fallback) => {
  const v = process.env[k];
  if (v == null || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env: ${k}`);
  }
  return v;
};

const today = new Date().toISOString().slice(0, 10);
const sections = {};

// -----------------------------------------------------------------------------
// Section C: npm audit --json
// -----------------------------------------------------------------------------
async function sectionC() {
  let json;
  try {
    const raw = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    json = JSON.parse(raw);
  } catch (e) {
    // npm audit exits non-zero when vulnerabilities exist but still prints JSON on stdout.
    if (e.stdout) {
      try { json = JSON.parse(e.stdout.toString()); } catch { json = null; }
    }
  }
  const sev = json?.metadata?.vulnerabilities ?? {};
  const critical = sev.critical ?? 0;
  const high = sev.high ?? 0;
  const alert = critical + high > 0;
  return {
    alert,
    critical,
    high,
    moderate: sev.moderate ?? 0,
    low: sev.low ?? 0,
    total: sev.total ?? 0,
  };
}

// -----------------------------------------------------------------------------
// Section D: dist/ byte count + history comparison
// -----------------------------------------------------------------------------
async function dirSize(dir) {
  let total = 0;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(p);
    else total += statSync(p).size;
  }
  return total;
}

async function sectionD() {
  const bytes = await dirSize('dist');
  let prevBytes = null;
  if (existsSync('bundle-history.txt')) {
    const lines = readFileSync('bundle-history.txt', 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length) {
      const last = lines[lines.length - 1].split('\t');
      if (last.length >= 2) prevBytes = Number(last[1]);
    }
  }
  const deltaPct = prevBytes && prevBytes > 0 ? ((bytes - prevBytes) / prevBytes) * 100 : null;
  const alert = deltaPct != null && deltaPct > 10;
  // Append today's entry.
  const prevContent = existsSync('bundle-history.txt') ? readFileSync('bundle-history.txt', 'utf8') : '';
  writeFileSync('bundle-history.txt', `${prevContent}${today}\t${bytes}\n`);
  return { bytes, prevBytes, deltaPct, alert };
}

// -----------------------------------------------------------------------------
// Section E: git diff last 7 days + optional Claude review
// -----------------------------------------------------------------------------
function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
}

async function sectionE() {
  let diff = '';
  let linesChanged = 0;
  let baseRef = null;
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    baseRef = runGit(['rev-list', '-1', `--before=${since}`, 'HEAD']).trim();
    if (!baseRef) return { skipped: true, reason: 'no commit 7 days ago' };
    diff = runGit(['diff', baseRef, 'HEAD', '--', 'src/']);
    linesChanged = diff.split('\n').filter(l => /^[+-][^+-]/.test(l)).length;
  } catch (e) {
    return { skipped: true, reason: `git diff failed: ${e.message}` };
  }
  if (linesChanged === 0) return { skipped: true, reason: 'no changes in src/ over 7 days', linesChanged };
  if (linesChanged > 5000) return { skipped: true, reason: `diff too large (${linesChanged} lines)`, linesChanged };
  if (!process.env.ANTHROPIC_API_KEY) return { skipped: true, reason: 'ANTHROPIC_API_KEY not set', linesChanged };

  const prompt = `You are reviewing a 7-day diff of a TypeScript/JavaScript codebase.
Report ONLY critical issues (security vulnerabilities, data loss risks, logic bugs that break production).
If you find none, respond with exactly: NO_CRITICAL_ISSUES
Keep the response under 1500 characters. Use bullet points with file references.

--- DIFF ---
${diff.slice(0, 400_000)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    return { skipped: true, reason: `Claude API ${res.status}: ${await res.text()}`, linesChanged };
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text?.trim() ?? '';
  return { linesChanged, baseRef, review: text, clean: text === 'NO_CRITICAL_ISSUES' };
}

// -----------------------------------------------------------------------------
// Section F: Vercel REST API — latest deployment state
// -----------------------------------------------------------------------------
async function sectionF() {
  const token = env('VERCEL_TOKEN');
  const teamId = env('VERCEL_TEAM_ID');
  const app = env('VERCEL_APP_NAME', 'lumenium-app');
  const url = `https://api.vercel.com/v6/deployments?teamId=${encodeURIComponent(teamId)}&app=${encodeURIComponent(app)}&limit=1`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return { error: `Vercel API ${res.status}: ${await res.text()}` };
  const data = await res.json();
  const dep = data?.deployments?.[0];
  if (!dep) return { error: 'No deployments returned' };
  return {
    state: dep.state,
    url: dep.url ? `https://${dep.url}` : null,
    createdAt: dep.created ? new Date(dep.created).toISOString() : null,
    alert: dep.state === 'ERROR',
  };
}

// -----------------------------------------------------------------------------
// Section G: Vercel env var sensitivity audit
// -----------------------------------------------------------------------------
async function sectionG() {
  const token = env('VERCEL_TOKEN');
  const teamId = env('VERCEL_TEAM_ID');
  const app = env('VERCEL_APP_NAME', 'lumenium-app');
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(app)}/env?teamId=${encodeURIComponent(teamId)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return { error: `Vercel env API ${res.status}: ${await res.text()}` };
  const data = await res.json();
  const envs = data?.envs ?? [];
  // Vercel env types: system | secret | encrypted | plain | sensitive.
  // "system" is auto-managed by Vercel, so it is excluded from the audit.
  const userEnvs = envs.filter(e => e.type !== 'system');
  const nonSensitive = userEnvs.filter(e => e.type !== 'sensitive');
  return {
    total: userEnvs.length,
    nonSensitive: nonSensitive.map(e => ({
      key: e.key,
      type: e.type,
      target: Array.isArray(e.target) ? e.target.join(',') : (e.target ?? ''),
    })),
    alert: nonSensitive.length > 0,
  };
}

// -----------------------------------------------------------------------------
// Section H: Notion report
// -----------------------------------------------------------------------------
function buildMarkdown(r) {
  const lines = [];
  lines.push(`# Nightly Report — ${today}`);
  lines.push('');
  lines.push(`- Commit: \`${(process.env.GITHUB_SHA ?? 'local').slice(0, 7)}\``);
  const runUrl = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;
  if (runUrl) lines.push(`- Run: ${runUrl}`);
  lines.push('');

  lines.push('## C. npm audit');
  const c = r.C;
  lines.push(c.alert ? `⚠️ critical=${c.critical} high=${c.high}` : `OK (critical=${c.critical} high=${c.high})`);
  lines.push(`moderate=${c.moderate} low=${c.low} total=${c.total}`);
  lines.push('');

  lines.push('## D. Bundle size');
  const d = r.D;
  const fmt = b => `${(b / 1024).toFixed(1)} KB`;
  if (d.prevBytes == null) {
    lines.push(`${fmt(d.bytes)} (no previous data)`);
  } else {
    const sign = d.deltaPct >= 0 ? '+' : '';
    lines.push(`${fmt(d.bytes)} (prev ${fmt(d.prevBytes)}, ${sign}${d.deltaPct.toFixed(1)}%)`);
    if (d.alert) lines.push('⚠️ bundle grew more than 10%');
  }
  lines.push('');

  lines.push('## E. 7-day code review');
  const e = r.E;
  if (e.skipped) {
    lines.push(`skipped: ${e.reason}`);
  } else if (e.clean) {
    lines.push(`no critical issues found (${e.linesChanged} diff lines)`);
  } else {
    lines.push(`${e.linesChanged} diff lines reviewed:`);
    lines.push('');
    lines.push(e.review);
  }
  lines.push('');

  lines.push('## F. Vercel deployment');
  const f = r.F;
  if (f.error) {
    lines.push(`error: ${f.error}`);
  } else {
    const icon = f.state === 'READY' ? '✅' : f.state === 'ERROR' ? '⚠️' : '⏳';
    lines.push(`${icon} state=${f.state}`);
    if (f.url) lines.push(`url: ${f.url}`);
    if (f.createdAt) lines.push(`createdAt: ${f.createdAt}`);
  }
  lines.push('');

  lines.push('## G. Vercel env var audit');
  const g = r.G;
  if (g.error) {
    lines.push(`error: ${g.error}`);
  } else if (g.alert) {
    lines.push(`⚠️ ${g.nonSensitive.length}/${g.total} env vars are NOT marked Sensitive`);
    lines.push('');
    for (const e of g.nonSensitive) {
      lines.push(`- \`${e.key}\` (type=${e.type}, target=${e.target})`);
    }
  } else {
    lines.push(`OK — all ${g.total} env vars marked Sensitive`);
  }
  lines.push('');

  return lines.join('\n');
}

// Convert markdown text to Notion block children. Splits any single paragraph
// that exceeds Notion's 2000-char rich_text limit into multiple blocks.
function mdToBlocks(md) {
  const MAX = 1900;
  const blocks = [];
  const pushParagraph = text => {
    for (let i = 0; i < text.length; i += MAX) {
      const chunk = text.slice(i, i + MAX);
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] },
      });
    }
  };
  const pushHeading = (text, level) => {
    const type = level === 1 ? 'heading_1' : level === 2 ? 'heading_2' : 'heading_3';
    blocks.push({
      object: 'block',
      type,
      [type]: { rich_text: [{ type: 'text', text: { content: text.slice(0, MAX) } }] },
    });
  };
  const pushBullet = text => {
    blocks.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text.slice(0, MAX) } }] },
    });
  };

  for (const rawLine of md.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { pushHeading(h[2], h[1].length); continue; }
    const b = /^[-*]\s+(.*)$/.exec(line);
    if (b) { pushBullet(b[1]); continue; }
    pushParagraph(line);
  }
  return blocks;
}

async function sectionH(markdown) {
  const token = env('NOTION_TOKEN');
  const parent = env('NOTION_PARENT_PAGE_ID');
  const blocks = mdToBlocks(markdown);
  const body = {
    parent: { page_id: parent },
    properties: {
      title: [{ type: 'text', text: { content: `Nightly ${today}` } }],
    },
    // Notion caps children per request at 100; we split if needed.
    children: blocks.slice(0, 100),
  };
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'notion-version': '2022-06-28',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion create page ${res.status}: ${await res.text()}`);
  const page = await res.json();

  // Append remaining blocks in batches of 100.
  for (let i = 100; i < blocks.length; i += 100) {
    const chunk = blocks.slice(i, i + 100);
    const r2 = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'notion-version': '2022-06-28',
      },
      body: JSON.stringify({ children: chunk }),
    });
    if (!r2.ok) throw new Error(`Notion append ${r2.status}: ${await r2.text()}`);
  }
  return page.url ?? page.id;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
const results = {};
results.C = await sectionC();
results.D = await sectionD();
results.E = await sectionE();
results.F = await sectionF();
results.G = await sectionG();

const md = buildMarkdown(results);
writeFileSync('nightly-report.md', md);
console.log('--- report preview ---\n' + md + '\n----------------------');

const pageUrl = await sectionH(md);
console.log(`Posted to Notion: ${pageUrl}`);
