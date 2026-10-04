export const config = { runtime: 'edge' }

// プロフィールのリンク集（/links。vercel.json で /links → /api/links）。
//
// Instagram や TikTok は、プロフィールにリンクを1つしか置けません。そこに
//   https://<サイト>/links?from=instagram
// を置くと、このページが「大事なリンク」と「最近の投稿のリンク」を並べます。
// 自社サイトへのリンクには ?ref=instagram&utm_campaign=bio を付けるので、
// アクセス解析で「Instagram のプロフィールから来た人」と分かります
// （from を tiktok にすれば TikTok として数えます）。
//
// このページ自体の訪問も、静的ページと同じ計測（beacon）で数えます。
// from は、計測が読む前に ?ref=…&utm_campaign=bio に読み替えます。
//
// 検索には出してかまいません（中身はサイトの大事なリンクの一覧で、隠す理由が
// ありません）。ただし ?from= ごとに別のページと見なされないよう、
// canonical は常にクエリなしの /links にします。サイトマップには入れません
// （プロフィールから来る人のための入口で、検索から来てほしいページではないため）。
//
// 一覧は管理画面の「SNS（文章）› プロフィールのリンク集」で直します。

import { BRAND } from './_brand.js'
import { readLinks } from './_social-store.js'
import { recentPosts } from './_social.js'
import { bioUrl, bioSource, findUrls } from './_social-text.js'
import { BEACON } from './_beacon-snippet.js'

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function sameSite(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') === BRAND.host.replace(/^www\./, '') } catch (_) { return false }
}

/** 最近の投稿のリンク（自社サイトへのものだけ、同じ行き先は1つに）。 */
export function latestLinks(posts, n) {
  const out = []
  const seen = new Set()
  for (const p of posts || []) {
    if (out.length >= n) break
    if (!p || !p.link || !sameSite(p.link)) continue
    if (!(p.results || []).some((r) => r.ok)) continue
    let key
    try { const u = new URL(p.link); key = u.origin + u.pathname } catch (_) { continue }
    if (seen.has(key)) continue
    seen.add(key)
    let title = String(p.text || '')
    for (const u of findUrls(title).reverse()) title = title.slice(0, u.start) + title.slice(u.end)
    title = title.split('\n').map((s) => s.trim()).filter(Boolean)[0] || p.link
    out.push({ title: title.length > 40 ? title.slice(0, 39) + '…' : title, url: p.link, at: String(p.at || '').slice(0, 10) })
  }
  return out
}

export function renderLinks({ links, latest, from }) {
  const src = bioSource(from)
  const canonical = `${BRAND.url.replace(/\/$/, '')}/links`
  const items = (links.items || []).filter((i) => i.on !== false)
  if (!items.length) items.push({ title: 'トップページ', url: BRAND.url })
  const a = (i, sub) => `<li><a class="lk" href="${esc(bioUrl(i.url, src, BRAND.host))}"${sameSite(i.url) ? '' : ' rel="noopener"'}>` +
    `<span class="t">${esc(i.title)}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ''}</a></li>`
  const title = links.title || BRAND.name
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}｜リンク集</title>
<meta name="description" content="${esc(links.note || `${BRAND.name} の大事なリンクと、最近のお知らせ。`)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index, follow">
<meta property="og:title" content="${esc(title)}｜リンク集">
<meta property="og:url" content="${esc(canonical)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/brand.css">
<style>
  body { margin: 0; min-height: 100vh; }
  .wrap { max-width: 520px; margin: 0 auto; padding: 36px 16px 48px; }
  h1 { font-size: 24px !important; text-align: center; margin: 0 0 6px; }
  .lk-note { text-align: center; font-size: 13.5px; line-height: 1.8; margin: 0 0 22px; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  li::before { content: none !important; }
  .lk { display: flex; flex-direction: column; gap: 2px; padding: 15px 18px; background: var(--card); border: 1px solid var(--hair); border-radius: 14px; text-decoration: none; color: var(--ink); }
  .lk:hover, .lk:focus-visible { border-color: var(--accent); }
  .lk:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .lk .t { font-size: 15px; font-weight: 700; color: var(--ink); overflow-wrap: anywhere; }
  .lk .s { font-size: 12px; color: var(--ink-mute); }
  h2 { font-size: 14px !important; margin: 28px 0 10px; color: var(--ink-mute) !important; font-family: inherit !important; letter-spacing: .08em; }
  footer { margin-top: 32px; text-align: center; font-size: 12px; color: var(--ink-mute); }
  footer a { color: var(--accent); }
</style>
</head>
<body>
<main class="wrap">
  <h1>${esc(title)}</h1>
  ${links.note ? `<p class="lk-note">${esc(links.note)}</p>` : '<p class="lk-note">大事なリンクと、最近のお知らせです。</p>'}
  <ul>
${items.map((i) => '    ' + a(i)).join('\n')}
  </ul>
${latest.length ? `  <h2>最近のお知らせ</h2>
  <ul>
${latest.map((i) => '    ' + a(i, i.at ? i.at.replace(/-/g, '/') : '')).join('\n')}
  </ul>` : ''}
  <footer><a href="${esc(bioUrl(BRAND.url, src, BRAND.host))}">${esc(BRAND.name)}</a></footer>
</main>
<script>(function(){try{var q=new URLSearchParams(location.search);var f=q.get('from');if(f&&!q.get('ref')){q.delete('from');q.set('ref',${JSON.stringify(src)});q.set('utm_campaign','bio');history.replaceState(history.state,'',location.pathname+'?'+q.toString()+location.hash)}}catch(e){}})()</script>
${BEACON}
</body>
</html>`
}

export async function GET(req) {
  const u = new URL(req.url)
  const from = u.searchParams.get('from') || u.searchParams.get('ref') || ''
  let links = { title: '', note: '', latest: 3, items: [] }
  let latest = []
  try {
    links = await readLinks()
    if (links.latest) latest = latestLinks(await recentPosts(40), links.latest)
  } catch (_) { /* 保存先が無くても、トップへのリンクだけは出します */ }
  return new Response(renderLinks({ links, latest, from }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // 一覧を直したら数分で反映されます。from ごとに別に覚えます（URL が違うため）。
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
