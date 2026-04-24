// Anthropic API calls. Uses Claude Sonnet 4.6 with server-side web_search tool.

import { env } from './util.mjs';

const MODEL = process.env.AI_NEWS_MODEL || 'claude-sonnet-4-6';
const API = 'https://api.anthropic.com/v1/messages';

async function call(body) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  return res.json();
}

function extractText(data) {
  return (data?.content ?? [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}

// Run a web-search-enabled prompt. Returns concatenated text output.
export async function searchAndExtract(prompt, { maxUses = 5, maxTokens = 4096 } = {}) {
  const data = await call({
    model: MODEL,
    max_tokens: maxTokens,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
    messages: [{ role: 'user', content: prompt }],
  });
  return extractText(data);
}

// Plain prompt (no tools) — used for rendering digests & summaries.
export async function generate(prompt, { maxTokens = 4096 } = {}) {
  const data = await call({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return extractText(data);
}

// Safely parse a JSON array returned by Claude. Trims optional ```json fences.
export function parseJsonArray(text) {
  let s = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(s);
  if (fence) s = fence[1].trim();
  // Slice to the outermost array if extra prose wraps it.
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  const arr = JSON.parse(s);
  if (!Array.isArray(arr)) throw new Error('Expected a JSON array');
  return arr;
}
