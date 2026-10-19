// 管理画面（dist/admin-members.html）を、すぐ開けるように組み直します（vite build のあと）。
//
// 管理画面の HTML は毎回取り直す（no-store）ので、その中に書いた約45万字のスクリプトと、
// 名前の変わらない部品のファイル（毎回「変わっていないか」を聞きに行く）が、開くたびの
// 待ち時間になっていました。ここでは:
//   ・HTML の中のスクリプト（大きいもの）を外のファイルに出す
//   ・部品のスクリプトと CSS を、中身から作った名前（/assets/admin/<名前>-<ハッシュ>.js）にする
// 中身が変われば名前も変わるので、ブラウザは1年覚えておけます（vercel.json の /assets/ の決まり）。
// 実行の順番と書き方（同期のスクリプト）は元のままなので、動きは変わりません。
//
// 開いたときに読み込む部品（/reviews-core.js など）は、名前を変えずにそのままにします。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const PAGE = join(DIST, 'admin-members.html')
const OUT = join(DIST, 'assets', 'admin')
const BIG = 4000 // これより短いインラインのスクリプト（起動の合図など）は、そのまま残します

if (!existsSync(PAGE)) {
  console.error('build-admin-assets: dist/admin-members.html がありません（先に vite build）')
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10)
let html = readFileSync(PAGE, 'utf8')
const before = html.length
let files = 0
let inline = 0

function emit(name, ext, body) {
  const file = `${name}-${hash(body)}.${ext}`
  writeFileSync(join(OUT, file), body)
  files++
  return `/assets/admin/${file}`
}

// 部品のスクリプト
html = html.replace(/<script src="\/([a-z0-9-]+)\.js"><\/script>/g, (m, name) => {
  const src = join(DIST, `${name}.js`)
  if (!existsSync(src)) throw new Error(`build-admin-assets: ${name}.js が dist にありません`)
  return `<script src="${emit(name, 'js', readFileSync(src, 'utf8'))}"></script>`
})

// CSS
html = html.replace(/<link rel="stylesheet" href="\/([a-z0-9-]+)\.css">/g, (m, name) => {
  const src = join(DIST, `${name}.css`)
  if (!existsSync(src)) throw new Error(`build-admin-assets: ${name}.css が dist にありません`)
  return `<link rel="stylesheet" href="${emit(name, 'css', readFileSync(src, 'utf8'))}">`
})

// HTML の中の大きいスクリプト → 外のファイル（同期のまま、同じ場所で読みます）
html = html.replace(/<script>([\s\S]*?)<\/script>/g, (m, body) => {
  if (body.length < BIG) return m
  inline++
  return `<script src="${emit(`app-${inline}`, 'js', body)}"></script>`
})

writeFileSync(PAGE, html)
console.log(`build-admin-assets: ${files} files → /assets/admin/ (inline scripts moved: ${inline}); admin-members.html ${Math.round(before / 1024)}KB → ${Math.round(html.length / 1024)}KB`)
