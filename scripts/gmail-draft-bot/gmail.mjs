// Gmail REST API wrapper. Only two write operations are exposed — create_draft
// and nothing else. Sending, label mutations, filter edits are deliberately
// not implemented here (Phase 4 absolute-rule #1/#2).

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailFetch(accessToken, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Gmail API ${init.method ?? 'GET'} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function listMessages(accessToken, { q, maxResults = 30 }) {
  const url = `/messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`;
  const data = await gmailFetch(accessToken, url);
  return data.messages ?? [];
}

export async function getMessage(accessToken, id, format = 'metadata') {
  return gmailFetch(accessToken, `/messages/${id}?format=${format}`);
}

export async function getThread(accessToken, threadId) {
  return gmailFetch(accessToken, `/threads/${threadId}?format=full`);
}

// Fetch recent sent messages for style-learning. Returns an array of decoded
// plaintext bodies, newest first.
export async function listRecentSent(accessToken, { days = 30, pageSize = 30 } = {}) {
  const q = `in:sent newer_than:${days}d`;
  const msgs = await listMessages(accessToken, { q, maxResults: pageSize });
  const bodies = [];
  for (const { id } of msgs) {
    try {
      const m = await getMessage(accessToken, id, 'full');
      const text = decodePlainText(m.payload);
      if (text) bodies.push(text);
    } catch {
      // Skip messages we can't decode; style learning is best-effort.
    }
  }
  return bodies;
}

// Walks the MIME tree, returning the first text/plain body (base64url decoded),
// falling back to a stripped text/html body. Returns empty string if nothing
// is found.
export function decodePlainText(payload) {
  if (!payload) return '';
  const stack = [payload];
  let html = '';
  while (stack.length) {
    const p = stack.shift();
    const mime = p.mimeType ?? '';
    const data = p.body?.data;
    if (mime === 'text/plain' && data) return b64urlDecode(data);
    if (mime === 'text/html' && data && !html) html = b64urlDecode(data);
    if (p.parts) stack.push(...p.parts);
  }
  return html ? stripHtml(html) : '';
}

export function getHeader(headers = [], name) {
  const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

// Parse `"Name" <addr@example.com>` or bare `addr@example.com`.
export function parseFromHeader(value) {
  if (!value) return { name: '', email: '' };
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/.exec(value);
  if (!m) return { name: '', email: value.trim() };
  return { name: (m[1] ?? '').trim().replace(/^"|"$/g, ''), email: m[2].trim() };
}

// RFC 2822 message body encoded as base64url for the `raw` field.
export function buildRawMessage({ to, from, subject, inReplyTo, references, bodyText }) {
  const lines = [];
  lines.push(`To: ${to}`);
  if (from) lines.push(`From: ${from}`);
  lines.push(`Subject: ${encodeRfc2047(subject)}`);
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: 8bit');
  lines.push('');
  lines.push(bodyText);
  const raw = lines.join('\r\n');
  return b64urlEncode(Buffer.from(raw, 'utf8'));
}

export async function createDraft(accessToken, { threadId, raw }) {
  return gmailFetch(accessToken, '/drafts', {
    method: 'POST',
    body: JSON.stringify({ message: { threadId, raw } }),
  });
}

// ---- encoding helpers ----

function b64urlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Encode non-ASCII subject lines as MIME encoded-word (RFC 2047) so clients
// render Japanese correctly. Pure-ASCII subjects are returned untouched.
function encodeRfc2047(s) {
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
