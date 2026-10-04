// api/_social-text.js を、管理画面がそのまま読める形（public/social-text.js）にします。
//
// 文字数の数え方（X は日本語1文字=2、URL=23）と、計測用リンクの付け方は、
// 画面とサーバーで1つでなければなりません。2つあると、画面で「送れます」と
// 出た投稿がサーバーや X に断られます。元はサーバー側の1ファイルだけにして、
// ビルドのたびにここで写します。
//
// 管理画面は普通の <script> で読むので、export を外して即時関数で包み、
// window.lumSocialText に載せます。

import { readFileSync, writeFileSync } from 'node:fs'

const SRC = new URL('../api/_social-text.js', import.meta.url)
const OUT = new URL('../public/social-text.js', import.meta.url)

export function build() {
  const src = readFileSync(SRC, 'utf8')
  if (/^\s*import\s/m.test(src)) throw new Error('_social-text.js は import を持てません（画面でも読むため）')
  const names = []
  const body = src.replace(/^export\s+(const|var|let|function)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => {
    names.push(name)
    return `${kind} ${name}`
  })
  return '/* 自動生成: scripts/build-social-text.mjs が api/_social-text.js から作ります。直接は直さないでください。 */\n' +
    '(function () {\n' + body + '\nwindow.lumSocialText = { ' + names.join(', ') + ' };\n})();\n'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(OUT, build())
  console.log('  public/social-text.js を作りました')
}
