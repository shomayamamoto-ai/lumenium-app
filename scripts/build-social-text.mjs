// api/_social-text.js を、管理画面がそのまま読める形（public/social-text.js）にします。
// 同じやり方で、api/_social-attention.js（「要対応」の数え方）も public/social-attention.js にします。
//
// 文字数の数え方（X は日本語1文字=2、URL=23）と、計測用リンクの付け方は、
// 画面とサーバーで1つでなければなりません。2つあると、画面で「送れます」と
// 出た投稿がサーバーや X に断られます。元はサーバー側の1ファイルだけにして、
// ビルドのたびにここで写します。「要対応」の数も、タブの横の数と画面の上の帯が
// 食い違わないよう、同じ1ファイルから写します。
//
// 管理画面は普通の <script> で読むので、export を外して即時関数で包み、
// window.lumSocialText（window.lumSocialAttn）に載せます。

import { readFileSync, writeFileSync } from 'node:fs'

const FILES = [
  { src: '_social-text.js', out: 'social-text.js', global: 'lumSocialText' },
  { src: '_social-attention.js', out: 'social-attention.js', global: 'lumSocialAttn' },
]

function one(f) {
  const src = readFileSync(new URL('../api/' + f.src, import.meta.url), 'utf8')
  if (/^\s*import\s/m.test(src)) throw new Error(f.src + ' は import を持てません（画面でも読むため）')
  const names = []
  const body = src.replace(/^export\s+(const|var|let|function)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => {
    names.push(name)
    return `${kind} ${name}`
  })
  return `/* 自動生成: scripts/build-social-text.mjs が api/${f.src} から作ります。直接は直さないでください。 */\n` +
    '(function () {\n' + body + `\nwindow.${f.global} = { ` + names.join(', ') + ' };\n})();\n'
}

/** public/social-text.js の中身（テストが比べます）。 */
export function build() { return one(FILES[0]) }
/** public/social-attention.js の中身。 */
export function buildAttention() { return one(FILES[1]) }

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of FILES) {
    writeFileSync(new URL('../public/' + f.out, import.meta.url), one(f))
    console.log('  public/' + f.out + ' を作りました')
  }
}
