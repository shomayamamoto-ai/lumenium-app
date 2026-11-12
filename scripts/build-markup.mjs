// src/lib/markup.js（文章の書式の読み方）を、管理画面がそのまま読める形
// （public/markup.js、window.lumMarkup）にします。サイト・静的ページ・管理画面の
// 見え方が同じ読み方になるように、元は1ファイルだけにしてここで写します
// （scripts/build-social-text.mjs と同じやり方）。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 同じやり方で写すファイル。rhythm.js は「人間らしい文章」の書き方の決まりと点検
// （api/human-write.js と管理画面の両方が読みます）。
export const FILES = {
  markup: { name: 'markup.js', global: 'lumMarkup' },
  rhythm: { name: 'rhythm.js', global: 'lumRhythm' },
}

export function build(which = 'markup') {
  const f = FILES[which]
  const src = readFileSync(new URL(`../src/lib/${f.name}`, import.meta.url), 'utf8')
  if (/^\s*import\s/m.test(src)) throw new Error(`${f.name} は import を持てません（画面でも読むため）`)
  const names = []
  const body = src.replace(/^export\s+(function|const)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => { names.push(name); return `${kind} ${name}` })
  return `/* 自動生成: scripts/build-markup.mjs が src/lib/${f.name} から作ります。直接は直さないでください。 */\n` +
    '(function () {\n' + body + `\nwindow.${f.global} = { ` + names.join(', ') + ' };\n})();\n'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const which of Object.keys(FILES)) {
    const out = new URL(`../public/${FILES[which].name}`, import.meta.url)
    const text = build(which)
    let old = ''
    try { old = readFileSync(out, 'utf8') } catch (_) {}
    if (old !== text) writeFileSync(out, text)
    console.log(`  public/${FILES[which].name} を作りました`)
  }
}
