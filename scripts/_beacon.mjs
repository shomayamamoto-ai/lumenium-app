// 静的ページ（about.html, pricing.html, services/*.html …）に埋め込む計測。
//
// 中身は src/lib/beacon-core.js で、アプリ（トップページ）が使っているのと
// 同じファイルです。ここではそれを読み込んで小さくし、<script> に包むだけ。
//
// 以前は、ここに同じ処理を手で書き写していました。アプリ側だけ直して
// こちらが古いまま、が起きると、同じ1回の訪問が、トップページと静的ページで
// 違う数え方をされます（実際「訪問」の区切りがそれぞれ別で、ページを移る
// たびに「直接来た新しい訪問」が増えていました）。書き写すのをやめ、
// 1つのファイルから作ります。
//
// 自分のアクセスは数えません。印はこの端末の localStorage にだけ置き、
// 訪問者の端末には訪問の控え（sessionStorage、タブを閉じれば消える）しか
// 置きません。cookie は使いません。

import { readFileSync } from 'node:fs'
import { minify } from 'terser'

const core = readFileSync(new URL('../src/lib/beacon-core.js', import.meta.url), 'utf8')
  // ES モジュールとして書いてある1行だけを、ただの関数に戻します。
  .replace(/^export function lumBeacon\b/m, 'function lumBeacon')

if (/^\s*(import|export)\b/m.test(core)) {
  throw new Error('beacon-core.js に import / export が増えています。静的ページには埋め込めません。')
}

async function inline(cfg) {
  const { code } = await minify(
    `(function(){try{${core}\nlumBeacon(${cfg}).settle()}catch(e){}})()`,
    // ES5 で出します。静的ページには変換を通さずに入るので、古いブラウザで
    // 構文エラーになると、そのページの計測が黙って止まります。
    { ecma: 5, compress: { passes: 2 }, mangle: true, format: { comments: false } },
  )
  if (code.includes('</')) throw new Error('beacon に "</" が含まれています（<script> が途中で閉じます）')
  return `<script>${code}</script>`
}

/** ふつうのページ用。 */
export const BEACON = await inline('{}')

/** 404.html 用。閲覧ではなく「見つからなかったURL」として送ります。
 *  ふつうの閲覧として数えると、実在するページと同じ列に並んでしまい、
 *  リンク切れに気づけません。 */
export const BEACON_404 = await inline('{notFound:true}')
