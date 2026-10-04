// 404.html の計測を、ほかのページと同じ1つのファイルから入れ直します。
//
// 404.html は手で書いたページで、計測の数行だけを別に写して持っていました。
// 写しは直し漏れます。いまは「訪問」の区切りをページをまたいで引き継ぐので、
// 404 だけ古い数え方のままだと、壊れたリンクから来た人が、トップへ戻った
// 瞬間に「直接来た新しい訪問」に化けます。
//
// 書き換えるのは <!-- lum:beacon --> と <!-- /lum:beacon --> の間だけです。

import { readFileSync, writeFileSync } from 'node:fs'
import { BEACON_404 } from './_beacon.mjs'

const file = new URL('../public/404.html', import.meta.url)
const html = readFileSync(file, 'utf8')
const re = /<!-- lum:beacon -->[\s\S]*?<!-- \/lum:beacon -->/
if (!re.test(html)) throw new Error('public/404.html に <!-- lum:beacon --> の印がありません')
const next = html.replace(re, `<!-- lum:beacon -->\n${BEACON_404}\n<!-- /lum:beacon -->`)
if (next !== html) writeFileSync(file, next)
console.log('404.html: beacon ' + (next !== html ? 'updated' : 'unchanged'))
