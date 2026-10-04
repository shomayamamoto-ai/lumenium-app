// 関数が組み立てるページ（いまは /links のリンク集）にも、静的ページと同じ
// 計測を埋め込むためのファイル api/_beacon-snippet.js を作ります。
//
// 中身は scripts/_beacon.mjs の BEACON そのもの（src/lib/beacon-core.js を
// 小さくしたもの）です。関数はビルドの道具（terser）を実行時に持たないので、
// ここで文字列にして書き出し、コミットしておきます。元とずれていないかは
// scripts/test-social.mjs が確かめます。

import { writeFileSync } from 'node:fs'
import { BEACON } from './_beacon.mjs'

const OUT = new URL('../api/_beacon-snippet.js', import.meta.url)

export function build() {
  return '// 自動生成: scripts/build-beacon-snippet.mjs が作ります。直接は直さないでください。\n' +
    '// Files starting with "_" in /api are not exposed as endpoints by Vercel.\n' +
    'export const BEACON = ' + JSON.stringify(BEACON) + '\n'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(OUT, build())
  console.log('  api/_beacon-snippet.js を作りました')
}
