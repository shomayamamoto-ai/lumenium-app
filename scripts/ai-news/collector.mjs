#!/usr/bin/env node
// ai-news-collector — runs daily at 00:05 UTC (09:05 JST).
//
// Uses Claude's server-side web_search tool to find AI news from the last
// 24 hours, then stores each item as a row in the Notion database at
// NOTION_AI_NEWS_DB_ID with Status=New.
//
// Required env:
//   ANTHROPIC_API_KEY, NOTION_TOKEN, NOTION_AI_NEWS_DB_ID

import { env, todayJstISO, nowJstLabel } from './lib/util.mjs';
import { searchAndExtract, parseJsonArray } from './lib/claude.mjs';
import { createNewsPage, queryDb, readPlain } from './lib/notion.mjs';

const PROMPT = `You are an AI news scout. Use web_search to find the most important AI-industry
news published in the last 24 hours (as of ${nowJstLabel()}). Prioritize:

- frontier model releases and major model updates
- significant research papers (arXiv, major labs)
- industry news (funding, acquisitions, partnerships, policy)
- notable new developer tools, APIs, or evals

Return ONLY a JSON array (no prose, no markdown fences). Target 8–15 items.
Each item must be an object with exactly these keys:

  {
    "title": string,                  // article headline
    "url": string,                    // canonical URL
    "source": string,                 // publisher or domain (e.g. "The Verge")
    "category": string,               // one of: "Model", "Research", "Industry", "Tool", "Policy"
    "importance": string,             // one of: "High", "Medium", "Low"
    "summary": string,                // 2–3 sentences, factual, no opinions
    "published": string               // ISO date YYYY-MM-DD, best estimate
  }

Deduplicate: do not include multiple items for the same announcement.
Skip speculative rumor posts. Prefer primary sources (labs, company blogs) over aggregators.`;

const VALID_CATEGORY = new Set(['Model', 'Research', 'Industry', 'Tool', 'Policy']);
const VALID_IMPORTANCE = new Set(['High', 'Medium', 'Low']);

function normalize(item) {
  const out = {
    title: String(item.title ?? '').trim(),
    url: String(item.url ?? '').trim(),
    source: String(item.source ?? '').trim(),
    category: VALID_CATEGORY.has(item.category) ? item.category : 'Industry',
    importance: VALID_IMPORTANCE.has(item.importance) ? item.importance : 'Medium',
    summary: String(item.summary ?? '').trim(),
    publishedDate: typeof item.published === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.published)
      ? item.published
      : null,
  };
  return out;
}

async function existingUrls(dbId) {
  // Guard against duplicates across consecutive runs. Pull everything with
  // Collected within the last 3 days and treat their URLs as seen.
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pages = await queryDb(dbId, {
    property: 'Collected',
    date: { on_or_after: threeDaysAgo },
  });
  return new Set(pages.map(p => readPlain(p.properties?.URL)).filter(Boolean));
}

async function main() {
  env('ANTHROPIC_API_KEY');
  env('NOTION_TOKEN');
  const dbId = env('NOTION_AI_NEWS_DB_ID');
  const today = todayJstISO();

  console.log(`[collector] ${nowJstLabel()} — searching for AI news…`);
  const raw = await searchAndExtract(PROMPT, { maxUses: 6, maxTokens: 6000 });

  let items;
  try {
    items = parseJsonArray(raw);
  } catch (e) {
    console.error('[collector] failed to parse Claude output as JSON:');
    console.error(raw);
    throw e;
  }
  console.log(`[collector] parsed ${items.length} candidate items`);

  const seen = await existingUrls(dbId);
  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const raw of items) {
    const n = normalize(raw);
    if (!n.title || !n.url) { skipped++; continue; }
    if (seen.has(n.url)) { skipped++; continue; }
    try {
      await createNewsPage(dbId, { ...n, collectedDate: today });
      seen.add(n.url);
      created++;
    } catch (e) {
      errors.push(`${n.url}: ${e.message}`);
    }
  }

  console.log(`[collector] created=${created} skipped=${skipped} errors=${errors.length}`);
  for (const e of errors) console.error(`  - ${e}`);
  if (created === 0 && errors.length > 0) process.exit(1);
}

await main();
