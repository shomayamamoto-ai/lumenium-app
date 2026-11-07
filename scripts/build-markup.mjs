// src/lib/markup.js（文章の書式の読み方）を、管理画面がそのまま読める形
// （public/markup.js、window.lumMarkup）にします。サイト・静的ページ・管理画面の
// 見え方が同じ読み方になるように、元は1ファイルだけにしてここで写します
// （scripts/build-social-text.mjs と同じやり方）。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = new URL('../src/lib/markup.js', import.meta.url)
const OUT = new URL('../public/markup.js', import.meta.url)

export function build() {
  const src = readFileSync(SRC, 'utf8')
  if (/^\s*import\s/m.test(src)) throw new Error('markup.js は import を持てません（画面でも読むため）')
  const names = []
  const body = src.replace(/^export\s+(function|const)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => { names.push(name); return `${kind} ${name}` })
  return '/* 自動生成: scripts/build-markup.mjs が src/lib/markup.js から作ります。直接は直さないでください。 */\n' +
    '(function () {\n' + body + '\nwindow.lumMarkup = { ' + names.join(', ') + ' };\n})();\n'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = build()
  let old = ''
  try { old = readFileSync(OUT, 'utf8') } catch (_) {}
  if (old !== text) writeFileSync(OUT, text)
  console.log('  public/markup.js を作りました')
}
