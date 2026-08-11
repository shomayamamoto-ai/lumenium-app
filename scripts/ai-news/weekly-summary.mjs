#!/usr/bin/env node
// ai-news-weekly-summary — runs Friday at 09:07 UTC (18:07 JST).
//
// Pulls the last 7 days of items from the Notion DB, asks Claude to write
// a Japanese weekly-trends report (themes, top stories, what to watch),
// and posts the result as a child page of NOTION_WEEKLY_PARENT_PAGE_ID.
//
// Required env:
//   ANTHROPIC_API_KEY, NOTION_TOKEN, NOTION_AI_NEWS_DB_ID,
//   NOTION_WEEKLY_PARENT_PAGE_ID

import { env, todayJstISO } from './lib/util.mjs';
import { queryDb, readPlain, createPageUnder } from './lib/notion.mjs';
import { generate } from './lib/claude.mjs';

function rowsFromPages(pages) {
  return pages.map(p => ({
    title: readPlain(p.properties?.Title),
    url: readPlain(p.properties?.URL),
    source: readPlain(p.properties?.Source),
    category: readPlain(p.properties?.Category) || 'Industry',
    importance: readPlain(p.properties?.Importance) || 'Medium',
    summary: readPlain(p.properties?.Summary),
    collected: readPlain(p.properties?.Collected),
  })).filter(r => r.title && r.url);
}

async function main() {
  env('ANTHROPIC_API_KEY');
  env('NOTION_TOKEN');
  const dbId = env('NOTION_AI_NEWS_DB_ID');
  const parent = env('NOTION_WEEKLY_PARENT_PAGE_ID');

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pages = await queryDb(
    dbId,
    { property: 'Collected', date: { on_or_after: sevenDaysAgo } },
    [{ property: 'Collected', direction: 'descending' }],
  );
  const rows = rowsFromPages(pages);
  console.log(`[weekly] ${rows.length} items since ${sevenDaysAgo}`);

  if (rows.length === 0) {
    console.log('[weekly] no items; skipping page creation');
    return;
  }

  const inventory = rows
    .map(r => `- [${r.collected} · ${r.importance} · ${r.category}] ${r.title} (${r.source}) — ${r.summary}\n  ${r.url}`)
    .join('\n');

  const prompt = `You are writing a Japanese-language weekly AI-industry trend report for a
technical audience. Below is an inventory of items collected over the past 7
days. Write a markdown document with the following structure:

# 今週のAI業界まとめ (${todayJstISO()})

## 主要なテーマ
(3つ以内のテーマを特定し、それぞれ2–3文で説明。該当する記事をインラインで引用して、リンクはmarkdown形式で埋め込む)

## 特に注目すべきリリース
(High importance の項目から最大5件を選び、各項目1–2文のコメントつきで箇条書き)

## 次週にかけてウォッチすべきこと
(リリース予定・発表待ち・政策動向など、2–4個の箇条書き。事実ベースで、推測は避ける)

## 参照した記事一覧
(全件を importance ごとにグルーピングして markdown bullet で列挙。フォーマット: "- [title](url) — source")

Rules:
- Do NOT invent facts. Only use information from the inventory below.
- Use markdown headings exactly as shown (levels 1–2).
- Keep the whole document under ~1800 Japanese characters (excluding the reference list).

Inventory:
${inventory}`;

  const markdown = await generate(prompt, { maxTokens: 8000 });

  const title = `Weekly AI Summary — ${todayJstISO()}`;
  const url = await createPageUnder(parent, title, markdown);
  console.log(`[weekly] posted to Notion: ${url}`);
}

await main();
