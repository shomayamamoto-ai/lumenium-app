// 3Dの描画部品（src/lib/lumen3d.js）を、静的ページと管理画面からも
// 読めるように public/lumen3d.js へ写します。
//
// 元は1つだけです。アプリ（Vite）は src から、静的ページと管理画面は
// ここで写したものを読みます。写しを手で直すと元と食い違うので、
// 直すのは必ず src/lib/lumen3d.js のほうです（ビルドのたびに上書きされます）。
import { readFileSync, writeFileSync } from 'node:fs'

const src = readFileSync('src/lib/lumen3d.js', 'utf8')
const head = '// ここは自動で作られた写しです。直すときは src/lib/lumen3d.js を直してください。\n'
writeFileSync('public/lumen3d.js', head + src)
console.log('lumen3d.js を public に写しました')
