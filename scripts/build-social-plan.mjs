// api/_social-plan-core.js を、管理画面がそのまま読める形（public/social-plan-core.js）にします。
//
// 運用プランの数え方（柱の割合・週の区切り・LINE の通数）は、画面とサーバーで
// 1つでなければなりません。元はサーバー側の1ファイルだけにして、ビルドのたびに
// ここで写します（scripts/build-social-text.mjs と同じやり方）。
//
// 管理画面は普通の <script> で読むので、export を外して即時関数で包み、
// window.lumSocialPlan に載せます。

import { readFileSync, writeFileSync } from 'node:fs'

const SRC = new URL('../api/_social-plan-core.js', import.meta.url)
const OUT = new URL('../public/social-plan-core.js', import.meta.url)

export function build() {
  const src = readFileSync(SRC, 'utf8')
  if (/^\s*import\s/m.test(src)) throw new Error('_social-plan-core.js は import を持てません（画面でも読むため）')
  const names = []
  const body = src.replace(/^export\s+(const|var|let|function)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => {
    names.push(name)
    return `${kind} ${name}`
  })
  return '/* 自動生成: scripts/build-social-plan.mjs が api/_social-plan-core.js から作ります。直接は直さないでください。 */\n' +
    '(function () {\n' + body + '\nwindow.lumSocialPlan = { ' + names.join(', ') + ' };\n})();\n'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(OUT, build())
  console.log('  public/social-plan-core.js を作りました')
}
