// Every string the copy editor offers must be rendered by something.
//
// The editor lists 395 editable strings. It has no way of knowing whether any
// given one reaches a page: it walks the data modules, and a value that no
// component reads looks exactly like one that every page shows. Three did not
// reach anything —
//
//   text.cta.button          the label on the site's main call to action,
//                            hardcoded in CTA.jsx while the editor offered it
//   text.home.placeholder    left over from a search box that no longer exists
//   text.home.searchButton   the same
//   site.PROFILE_BRICKS[].label  never read by the page that renders the rest
//                            of the brick
//
// — so editing them changed the file, reported success, and changed nothing on
// the site. That is worse than not offering them.
//
// This is a static check, deliberately: it runs in prebuild with no browser
// and no network. It asks whether the accessor for each path appears anywhere
// in the source, which is a weaker question than "does it render", but it is
// the one that catches a string nothing reads.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { collectPaths, REGISTRY } from '../src/lib/content-registry.js'

const ROOT = new URL('..', import.meta.url).pathname

// Where a string could legitimately be read. The data modules themselves and
// the registry are excluded: they define and enumerate, they do not render.
const DIRS = ['src', 'scripts']
const SKIP = new Set([
  join(ROOT, 'src/lib/content-registry.js'),
  join(ROOT, 'scripts/check-copy-reach.mjs'),
  join(ROOT, 'scripts/build-content-schema.mjs'),
])

function sources(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (e !== 'node_modules') sources(p, out)
      continue
    }
    if (!['.js', '.jsx', '.mjs'].includes(extname(e))) continue
    if (SKIP.has(p)) continue
    // src/data/* holds the strings; reading them there is not rendering them.
    if (p.startsWith(join(ROOT, 'src/data'))) continue
    out.push(p)
  }
  return out
}

const FILES = sources(join(ROOT, 'src')).concat(sources(join(ROOT, 'scripts')))
  .map((p) => ({ p, text: readFileSync(p, 'utf8') }))
const code = FILES.map((f) => f.text).join('\n')

// What this cannot check, and why it does not try:
//
// For the array groups the leaf key is read off a local — `k.label` inside a
// map, or `service.partnerUrl` on a prop three components away from the array
// it came from. Searching the whole source for ".label" matches dozens of
// unrelated objects and proves nothing; scoping to files that name the array
// misses every case where it arrives as a prop, and reports live fields as
// dead. Both were tried; the second flagged services.N.partnerUrl, which
// ServiceDetail renders.
//
// So arrays are checked at the array level only — is anything reading this
// list at all — and the per-key question is left to check-copy-render.mjs,
// which builds the site, crawls it and looks for the string itself. That one
// needs a browser, so it is run by hand rather than on every deploy.

// The exported name each group is actually imported under.
const ROOT_NAMES = {
  text: 'SECTION',
  services: 'SERVICES',
  faq: 'FAQ_GROUPS',
  articles: 'articles',
}

function accessorFor(path) {
  const parts = path.split('.')
  const group = parts[0]

  // text.cta.button -> SECTION.cta.button, which is exact.
  if (group === 'text') return { kind: 'exact', needle: 'SECTION.' + parts.slice(1).join('.') }

  // site.PROFILE_BRICKS.0.label -> the array is mapped over, so the index is
  // not in the source. What must appear is the array's name and the leaf key.
  const arrayName = group === 'site' ? parts[1] : ROOT_NAMES[group]
  const keys = parts.filter((p) => !/^\d+$/.test(p))
  const leaf = keys[keys.length - 1]
  // A numeric leaf (a string inside a plain array, e.g. highlights.0) is read
  // through its parent key.
  return { kind: 'key', arrayName, needle: leaf }
}

const missing = []
for (const { path } of collectPaths(REGISTRY)) {
  const a = accessorFor(path)
  if (a.kind === 'exact') {
    if (!code.includes(a.needle)) missing.push({ path, why: `${a.needle} が参照されていません` })
    continue
  }
  if (!code.includes(a.arrayName)) missing.push({ path, why: `${a.arrayName} を読んでいる箇所がありません` })
}

if (missing.length) {
  console.error('編集できるのに、どこにも表示されない文章があります:')
  for (const m of missing) console.error(`  ✗ ${m.path} — ${m.why}`)
  console.error('\n表示する側に配線するか、データから削除してください。')
  console.error('編集画面に出したまま反映されないのがいちばん困る状態です。')
  process.exit(1)
}
console.log(`編集できる文章 ${collectPaths(REGISTRY).length} 件、すべて読み出し先があります。`)
