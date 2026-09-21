export const config = { runtime: 'edge' }

// Search Console と Bing Webmaster Tools の所有権確認ファイルを返す。
//
// 登録の入口で止まるのは、たいてい「確認ファイルを置くために再デプロイが
// 要る」ところです。ファイルの中身は決まった一行なので、管理画面に貼った
// 値からここで組み立てて返します。貼った瞬間から有効で、デプロイは要りません。
//
//   /google<トークン>.html → google-site-verification: google<トークン>.html
//   /BingSiteAuth.xml      → <users><user>トークン</user></users>
//
// 設定されていない、あるいは要求されたファイル名が設定値と一致しないときは
// 404。ここで通してしまうと、誰でもこのサイトの所有権を主張できます。

import { setting } from './_settings.js'

const notFound = () => new Response('Not found', {
  status: 404,
  headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
})

const body = (text, type) => new Response(text, {
  headers: {
    'content-type': type,
    // 確認のたびに読みに来るので、CDNに固定させない。
    'cache-control': 'public, max-age=0, s-maxage=0, must-revalidate',
  },
})

/** Google は「google<32文字>.html」というファイル名を指定してきます。
 *  管理画面にはファイル名ごと貼られることも、トークンだけ貼られることも
 *  あるので、どちらでも受けて同じ形に直します。 */
export function googleFileName(value) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (/^google[0-9a-z]+\.html$/i.test(v)) return v.toLowerCase()
  if (/^google[0-9a-z]+$/i.test(v)) return `${v.toLowerCase()}.html`
  if (/^[0-9a-z]+$/i.test(v)) return `google${v.toLowerCase()}.html`
  return ''
}

export async function GET(req) {
  const path = new URL(req.url).pathname

  if (/^\/BingSiteAuth\.xml$/i.test(path)) {
    const token = String(await setting('BING_SITE_VERIFICATION', '')).trim()
    // XMLに入れるので、値の形を先に絞る（英数字とハイフンのみ）。
    if (!token || !/^[0-9A-Za-z-]{8,128}$/.test(token)) return notFound()
    return body(`<?xml version="1.0"?>\n<users>\n  <user>${token}</user>\n</users>\n`, 'application/xml; charset=utf-8')
  }

  const asked = (path.match(/^\/(google[0-9a-z]+\.html)$/i) || [, ''])[1].toLowerCase()
  if (asked) {
    const want = googleFileName(await setting('GOOGLE_SITE_VERIFICATION', ''))
    if (!want || want !== asked) return notFound()
    return body(`google-site-verification: ${want}`, 'text/html; charset=utf-8')
  }

  return notFound()
}
