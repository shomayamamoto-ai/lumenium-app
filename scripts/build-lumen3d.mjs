// 3Dの描画部品（src/lib/lumen3d.js）を、静的ページと管理画面からも
// 読めるように public/lumen3d.js へ写します。
//
// 元は1つだけです。アプリ（Vite）は src から、静的ページと管理画面は
// ここで写したものを読みます。写しを手で直すと元と食い違うので、
// 直すのは必ず src/lib/lumen3d.js のほうです（ビルドのたびに上書きされます）。
import { readFileSync, writeFileSync } from 'node:fs'

// 描画本体と、それが読む「使えるかの判定」の2つ。本体は './lumen3d-support.js'
// を相対で読むので、写し先でも同じ並びに置きます。
for (const name of ['lumen3d.js', 'lumen3d-support.js']) {
  const src = readFileSync('src/lib/' + name, 'utf8')
  const head = '// ここは自動で作られた写しです。直すときは src/lib/' + name + ' を直してください。\n'
  writeFileSync('public/' + name, head + src)
}
console.log('lumen3d.js と lumen3d-support.js を public に写しました')
