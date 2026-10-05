// AIの料金の目安と、月ごとの使用量の記録。
//
// 料金表はここ1か所にだけ置きます。値下げ・値上げや、使うモデルを変えたときに
// 直すのはこのファイルだけで済むようにするためです。
// 出典: Anthropic の公開料金（2026年9月時点）。claude-opus-5 は
// 入力 $5 / 出力 $25（100万トークンあたり）、キャッシュ書き込みは入力の1.25倍、
// キャッシュ読み込みは入力の0.1倍、ウェブ検索は1,000回あたり $10。
//
// 円の額は「目安」です。為替は動くので、実際の請求（ドル建て）とは数％ずれます。
// 正確な額は console.anthropic.com › Usage で確認してください。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { storeConfig, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'

/** USD per 1M tokens. claude-sonnet-5-5 は入力 $2 / 出力 $10、キャッシュ読み込み
 *  $0.2（書き込みは入力の1.25倍）。 */
export const PRICES = {
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
}

/** AIアドバイザーが使うモデル。deep = ふだんの相談、quick = 短い質問向けの
 *  安いほう（同じ質問でおよそ半分の額）。使用量は別々に記録し
 *  （advisor / advisor-quick）、月の合計は advisorMonth で足します。 */
export const ADVISOR_MODELS = { deep: 'claude-opus-5-5', quick: 'claude-sonnet-5-5' }
export const ADVISOR_KINDS = { deep: 'advisor', quick: 'advisor-quick' }
export const WEB_SEARCH_USD = 10 / 1000
/** 円に直すときのレート（目安）。 */
export const YEN_PER_USD = 150
/** アドバイザーの月の上限の既定値（円）。設定 ADVISOR_MONTHLY_YEN で変えられます。 */
export const DEFAULT_MONTHLY_YEN = 3000
/** アドバイザーの1日の回数の上限（api/advisor.js の spendGuard と同じ値）。 */
export const ADVISOR_DAILY_CALLS = 80

/** 使用量（API が返す usage の月の合計）から、ドルと円の目安を出します。 */
export function estimateCost(model, u) {
  const p = PRICES[model] || PRICES['claude-opus-5']
  const n = (k) => Number((u && u[k]) || 0)
  const usd =
    (n('in') * p.input + n('out') * p.output + n('cw') * p.cacheWrite + n('cr') * p.cacheRead) / 1e6 +
    n('ws') * WEB_SEARCH_USD
  return { usd, yen: Math.round(usd * YEN_PER_USD) }
}

/** 日本時間の年月（例: 2026-10）。 */
export function jstMonth(ms = Date.now()) {
  return new Date(ms + 9 * 3600000).toISOString().slice(0, 7)
}

const key = (kind, month) => `${KV}aiusage:${kind}:${month}`

/** 1回の呼び出しの usage を月の合計に足します。失敗しても機能は止めません。 */
export async function recordUsage(kind, usage) {
  const cfg = storeConfig()
  if (!cfg || !usage) return
  const st = usage.server_tool_use || {}
  const add = {
    in: usage.input_tokens, out: usage.output_tokens,
    cw: usage.cache_creation_input_tokens, cr: usage.cache_read_input_tokens,
    ws: st.web_search_requests, calls: 1,
  }
  const k = key(kind, jstMonth())
  const cmds = Object.entries(add).filter(([, v]) => Number(v) > 0).map(([f, v]) => ['HINCRBY', k, f, Math.floor(Number(v))])
  cmds.push(['EXPIRE', k, 400 * 24 * 3600])
  try { await pipeline(cfg, cmds) } catch (_) {}
}

/** 今月の使用量と円の目安。 */
export async function monthUsage(kind, model) {
  const cfg = storeConfig()
  const empty = { in: 0, out: 0, cw: 0, cr: 0, ws: 0, calls: 0 }
  const blank = { month: jstMonth(), usage: empty, ...estimateCost(model, empty), recorded: false }
  if (!cfg) return blank
  try {
    const [flat] = await pipeline(cfg, [['HGETALL', key(kind, jstMonth())]])
    const u = { ...empty }
    for (let i = 0; Array.isArray(flat) && i + 1 < flat.length; i += 2) u[flat[i]] = Number(flat[i + 1]) || 0
    return { month: jstMonth(), usage: u, ...estimateCost(model, u), recorded: true }
  } catch (_) {
    return blank
  }
}

/** AIアドバイザーの今月の合計（ふだんの相談と、安いほうのモデルの分を足したもの）。 */
export async function advisorMonth() {
  const [deep, quick] = await Promise.all([
    monthUsage(ADVISOR_KINDS.deep, ADVISOR_MODELS.deep),
    monthUsage(ADVISOR_KINDS.quick, ADVISOR_MODELS.quick),
  ])
  const calls = (deep.usage.calls || 0) + (quick.usage.calls || 0)
  return {
    month: deep.month, recorded: deep.recorded || quick.recorded,
    yen: deep.yen + quick.yen, usd: deep.usd + quick.usd, calls,
    usage: { ...deep.usage, calls }, deep, quick,
  }
}

/** 月の上限（円）。設定が数字でなければ既定値。 */
export function monthlyCap(raw) {
  const n = Math.floor(Number(String(raw || '').replace(/[,，円¥\s]/g, '')))
  return n > 0 ? n : DEFAULT_MONTHLY_YEN
}
