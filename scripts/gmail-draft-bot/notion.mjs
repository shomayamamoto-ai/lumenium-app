// Notion database wrapper for gmail_draft_log. The database schema must match
// the one in README.md — column names are hard-coded here to match the
// user-facing Japanese titles.

const BASE = 'https://api.notion.com/v1';

export async function appendLog(token, databaseId, row) {
  const properties = {
    '件名': title(row.subject),
    '処理日時': date(row.processedAt),
    '差出人名': richText(row.fromName),
    '差出人メール': email(row.fromEmail),
    '言語': select(row.language),
    'カテゴリ': select(row.category),
    'ステータス': select(row.status),
    '信頼度スコア': number(row.confidence),
    'AI下書き': richText(row.draftBody),
    'Thread ID': richText(row.threadId),
    'Draft ID': richText(row.draftId),
    'スキップ理由': richText(row.skipReason),
  };

  // Strip empty properties so Notion doesn't complain about missing schemas.
  for (const k of Object.keys(properties)) {
    if (properties[k] == null) delete properties[k];
  }

  const res = await fetch(`${BASE}/pages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'notion-version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
    }),
  });
  if (!res.ok) {
    throw new Error(`Notion append ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ---- property builders ----

const MAX = 1900; // Notion's per-rich-text limit is 2000; leave headroom.

function title(v) {
  if (!v) return undefined;
  return { title: [{ type: 'text', text: { content: String(v).slice(0, MAX) } }] };
}

function richText(v) {
  if (v == null || v === '') return undefined;
  return { rich_text: [{ type: 'text', text: { content: String(v).slice(0, MAX) } }] };
}

function email(v) {
  if (!v) return undefined;
  return { email: String(v) };
}

function select(v) {
  if (!v) return undefined;
  return { select: { name: String(v) } };
}

function number(v) {
  if (v == null) return undefined;
  return { number: Number(v) };
}

function date(iso) {
  if (!iso) return undefined;
  return { date: { start: iso } };
}
