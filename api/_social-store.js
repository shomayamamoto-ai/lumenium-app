// SNS（文章）の「このサイトの決まり」を保存する場所。
//
//   ${KV}social:style  … 使わない言葉と表記の統一（_social-text.js の validateStyle の形）
//
// 投稿の記録（_social.js）とは別のファイルにしています。読む人も書く人も
// 管理者だけで、送信の処理とは関係が無いためです。保存先（Upstash Redis）が
// 無いときは空の決まりを返し、保存は「保存先が要ります」と断ります。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeFor, storeConfig, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'
import { validateStyle } from './_social-text.js'

export const STYLE_KEY = `${KV}social:style`

const NO_STORE = '保存先（Upstash Redis）が未接続のため保存できません。設定状況から保存先をつないでください。'

async function cfgFor(req) {
  return req ? await storeFor(req) : storeConfig()
}

async function readJson(key, req, fallback) {
  const cfg = await cfgFor(req)
  if (!cfg) return fallback
  try {
    const [raw] = await pipeline(cfg, [['GET', key]])
    return raw ? JSON.parse(raw) : fallback
  } catch (_) { return fallback }
}

async function writeJson(key, value, req) {
  const cfg = await cfgFor(req)
  if (!cfg) return { ok: false, message: NO_STORE }
  try {
    await pipeline(cfg, [['SET', key, JSON.stringify(value)]])
    return { ok: true }
  } catch (_) { return { ok: false, message: '保存できませんでした。時間をおいてもう一度お試しください。' } }
}

/** 保存してある決まり。壊れた値が入っていても、確かめ直してから返します。 */
export async function readStyle(req) {
  return validateStyle(await readJson(STYLE_KEY, req, {})).style
}

export async function saveStyle(input, req) {
  const { style, problems } = validateStyle(input)
  const r = await writeJson(STYLE_KEY, style, req)
  return { ...r, style, problems }
}
