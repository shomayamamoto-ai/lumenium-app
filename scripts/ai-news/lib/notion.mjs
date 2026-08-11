// Thin Notion REST wrapper. Direct HTTP — no SDK.
//
// The AI-news database is identified by NOTION_AI_NEWS_DB_ID. Historically this
// was tracked in the spec as a "data source" ID; the Notion REST API refers to
// it as a database ID and accepts it under `database_id`.

import { env } from './util.mjs';

const VERSION = '2022-06-28';

function headers() {
  return {
    authorization: `Bearer ${env('NOTION_TOKEN')}`,
    'content-type': 'application/json',
    'notion-version': VERSION,
  };
}

async function call(path, method, body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Notion ${method} ${path} ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const rt = s => [{ type: 'text', text: { content: String(s ?? '').slice(0, 1900) } }];

export async function createNewsPage(dbId, item) {
  // `item` shape:
  //   { title, url, source, category, importance, summary, publishedDate, collectedDate }
  const properties = {
    Title: { title: rt(item.title) },
    URL: { url: item.url || null },
    Source: { rich_text: rt(item.source || '') },
    Category: { select: item.category ? { name: item.category } : null },
    Importance: { select: item.importance ? { name: item.importance } : null },
    Summary: { rich_text: rt(item.summary || '') },
    Published: item.publishedDate ? { date: { start: item.publishedDate } } : { date: null },
    Collected: { date: { start: item.collectedDate } },
    Status: { select: { name: 'New' } },
  };
  return call('/pages', 'POST', { parent: { database_id: dbId }, properties });
}

export async function queryDb(dbId, filter, sorts) {
  const body = { page_size: 100 };
  if (filter) body.filter = filter;
  if (sorts) body.sorts = sorts;
  const pages = [];
  let cursor;
  do {
    if (cursor) body.start_cursor = cursor;
    const res = await call(`/databases/${dbId}/query`, 'POST', body);
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages;
}

export async function setStatus(pageId, status) {
  return call(`/pages/${pageId}`, 'PATCH', {
    properties: { Status: { select: { name: status } } },
  });
}

export function readPlain(prop) {
  if (!prop) return '';
  if (prop.title) return prop.title.map(t => t.plain_text).join('');
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
  if (prop.url) return prop.url;
  if (prop.select) return prop.select?.name ?? '';
  if (prop.date) return prop.date?.start ?? '';
  return '';
}

// Convert markdown text to Notion block children, splitting any long paragraph
// across the 2000-char per-block limit. Same approach as nightly/run.mjs.
export function mdToBlocks(md) {
  const MAX = 1900;
  const blocks = [];
  const para = text => {
    for (let i = 0; i < text.length; i += MAX) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: text.slice(i, i + MAX) } }] },
      });
    }
  };
  const heading = (text, level) => {
    const type = level === 1 ? 'heading_1' : level === 2 ? 'heading_2' : 'heading_3';
    blocks.push({
      object: 'block',
      type,
      [type]: { rich_text: [{ type: 'text', text: { content: text.slice(0, MAX) } }] },
    });
  };
  const bullet = text => {
    blocks.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text.slice(0, MAX) } }] },
    });
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (!line) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { heading(h[2], h[1].length); continue; }
    const b = /^[-*]\s+(.*)$/.exec(line);
    if (b) { bullet(b[1]); continue; }
    para(line);
  }
  return blocks;
}

export async function createPageUnder(parentPageId, title, markdown) {
  const blocks = mdToBlocks(markdown);
  const page = await call('/pages', 'POST', {
    parent: { page_id: parentPageId },
    properties: { title: [{ type: 'text', text: { content: title } }] },
    children: blocks.slice(0, 100),
  });
  for (let i = 100; i < blocks.length; i += 100) {
    await call(`/blocks/${page.id}/children`, 'PATCH', { children: blocks.slice(i, i + 100) });
  }
  return page.url ?? page.id;
}
