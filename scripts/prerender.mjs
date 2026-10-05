// Puts the real top page into dist/index.html, after `vite build`.
//
// Until now #root held only the splash: a crawler that does not run
// JavaScript — the AI crawlers among them — read the top page as an empty
// screen plus a hand-written <noscript> summary that had drifted from what the
// page said. This renders <App /> on the server (src/entry-server.jsx) with
// the admin's copy overrides applied, and writes the result into #root under
// the splash.
//
// What a visitor sees does not change. The splash still covers the page until
// React mounts, and main.jsx still uses createRoot, which replaces the
// markup rather than adopting it (see the note there for why not hydrate).
//
// It also fills in the two things in index.html that depend on the content:
//   ・the FAQPage data, built from the questions the page shows
//   ・dateModified, the day the page's content last changed (_lastmod.mjs) —
//     and the same date on the top page's line in sitemap.xml.
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { brotliCompressSync, gzipSync, constants as Z } from 'node:zlib'
import { stamp, saveLastmod, DATE } from './_lastmod.mjs'

const ROOT = new URL('../', import.meta.url)
const at = (p) => new URL(p, ROOT)
// Built here and deleted at the end; it is a build tool, not something to ship.
const TMP = at('.prerender-tmp/')

/** Same escaping as the page generators: a "</script>" inside an editable
 *  FAQ answer must not be able to close the block. */
const ldJson = (value) =>
  JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

/** Rewrite a file in dist/ and the compressed copies vite wrote next to it,
 *  so the .br/.gz never serve the page as it was before this step. */
function writeDist(rel, text) {
  const file = at('dist/' + rel)
  writeFileSync(file, text)
  if (existsSync(at('dist/' + rel + '.br'))) {
    writeFileSync(at('dist/' + rel + '.br'), brotliCompressSync(Buffer.from(text), { params: { [Z.BROTLI_PARAM_QUALITY]: 11 } }))
  }
  if (existsSync(at('dist/' + rel + '.gz'))) writeFileSync(at('dist/' + rel + '.gz'), gzipSync(Buffer.from(text), { level: 9 }))
}

/* 公開する news.json からは、公開日の来ていない予約を外します。public/ の
   ほうは管理画面が保存する元のファイルなので、そのままにします。外さないと、
   予約した文面が /news.json で公開日より前に読めてしまいます。 */
{
  const { liveNews, jstToday } = await import('../src/lib/news.js')
  try {
    const all = JSON.parse(readFileSync(at('dist/news.json'), 'utf8'))
    const live = liveNews(all, jstToday())
    if (Array.isArray(all) && live.length !== all.length) {
      writeDist('news.json', JSON.stringify(live, null, 2) + '\n')
      console.log(`news.json: 予約中の ${all.length - live.length} 件を公開用から外しました`)
    }
  } catch (_) { /* no news.json in dist — nothing to filter */ }
}

try {
  await build({
    // Its own small config: the client build's (compression, chunking) is
    // for files that ship, and nothing here ships.
    configFile: false,
    root: ROOT.pathname,
    logLevel: 'warn',
    plugins: [react()],
    build: {
      ssr: 'src/entry-server.jsx',
      outDir: TMP.pathname,
      emptyOutDir: true,
      copyPublicDir: false,
      minify: false,
    },
  })

  const { render } = await import(pathToFileURL(TMP.pathname + 'entry-server.js').href)
  let overrides = {}
  try { overrides = JSON.parse(readFileSync(at('public/content.json'), 'utf8')) } catch (_) { /* built-in copy stands */ }
  const { html: app, faq } = render(overrides)

  let page = readFileSync(at('dist/index.html'), 'utf8')
  for (const mark of ['<!--prerender:app-->', '<!--prerender:faq-->']) {
    if (!page.includes(mark)) throw new Error(`index.html has no ${mark} — was it removed?`)
  }
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
  page = page
    .replace('<!--prerender:faq-->', `<script type="application/ld+json">\n${ldJson(faqLd)}\n    </script>`)
    .replace('<!--prerender:app-->', app)
  if (!page.includes(DATE)) throw new Error('index.html has no dateModified placeholder')

  const { html: out, date } = stamp('/', page)
  writeDist('index.html', out)
  saveLastmod()

  // The sitemap was written before this step, from the date on record. If
  // the page changed in this build, that line is a day behind; correct it in
  // both the source and the copy already in dist/.
  const root = /(<loc>[a-z]+:\/\/[^/<]+\/<\/loc>\s*<lastmod>)[^<]*(<\/lastmod>)/
  for (const rel of ['public/sitemap.xml', 'dist/sitemap.xml']) {
    if (!existsSync(at(rel))) continue
    const xml = readFileSync(at(rel), 'utf8')
    const next = xml.replace(root, `$1${date}$2`)
    if (next === xml) continue
    if (rel.startsWith('dist/')) writeDist('sitemap.xml', next)
    else writeFileSync(at(rel), next)
  }
  // llms.txt says when the site last changed; the top page may just have.
  await import('./build-crawl-assets.mjs')

  const text = app.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  console.log(`prerendered /: ${app.length} bytes of HTML, ${text.length} characters of text, ${faq.length} FAQ, dateModified ${date}`)
} finally {
  rmSync(TMP, { recursive: true, force: true })
}
