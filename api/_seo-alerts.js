// SEO / AIO の「変化のお知らせ」。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// 画面に数字を並べても、毎回すべてを読み比べる人はいません。前回から
// 何かが悪い方へ動いたときだけ、それを一行で先に言います。言うのは4つ。
//
//   1. AIの回答で名前が出る割合が、誤差を超えて下がった
//      （同じ質問を同じAIに聞いた前回とだけ比べます。_aio-stats.js の検定で
//       「誤差の範囲」なら言いません——言うと、偶然の上下で毎回騒ぐことになります）
//   2. 競合の会社が、名前の出た回数で自社を追い越した
//   3. AIのクローラー（GPTBot・ClaudeBot・PerplexityBot など）が14日以上来ていない
//      （一度も来たことが無いものは言いません。それは「サイトの点検・クローラー」の
//       「まだ来ていない」に出ていて、毎週お知らせしても新しいことはないため）
//   4. サイトの点検で、新しく「必ず直す」が見つかった
//
// ここにあるのは判定だけで、読み書きは api/aio.js（画面とタブの数）と
// api/weekly-report.js（週次メール）がします。

import { KV } from './_brand.js'
import { companyKey } from './_aio-catalog.js'

/** 点検で新しく見つかった「必ず直す」（site-audit.js が点検のたびに書きます）。 */
export const AUDIT_FRESH_KEY = `${KV}seo:audit:freshmust`
/** 「確認しました」を押したお知らせ（id の一覧）。 */
export const ALERTS_SEEN_KEY = `${KV}seo:alerts:seen`
/** 判定の結果を少しの間だけ取っておく（タブの数を数えるたびに計測を読み直さないため）。 */
export const ALERTS_CACHE_KEY = `${KV}seo:alerts:cache`
export const ALERTS_CACHE_TTL = 15 * 60

export const QUIET_DAYS = 14
/** 来なくなったら知らせるクローラー。AIの検索用・学習用のうち、主なもの。 */
export const WATCH_BOTS = ['OAI-SearchBot', 'GPTBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot']
/** 追い越しを言うのは、相手が2回以上挙がったときだけ（1回と0回の差は偶然で起きます）。 */
export const OVERTAKE_MIN = 2

const DAY = 86400000
const pct = (p) => `${Math.round((Number(p) || 0) * 100)}%`
const md = (iso) => {
  const t = Date.parse(iso || '')
  if (Number.isNaN(t)) return ''
  const d = new Date(t + 9 * 3600000)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

/** 2つの計測の、競合ごとの回数。companyKey で「株式会社」などの違いをそろえます。 */
function tally(run) {
  const out = new Map()
  let ours = 0
  for (const c of (run && run.summary && run.summary.competitors) || []) {
    if (c.us) { ours = Number(c.count) || 0; continue }
    const k = companyKey(c.name)
    if (k) out.set(k, { name: c.name, count: Number(c.count) || 0 })
  }
  return { ours, others: out }
}

/**
 * いまのお知らせ。
 *   latest:  最新の計測（summary つき）
 *   before:  latest と比べられる前回の計測（無ければ null）
 *   compare: { openMention, recommend }（_aio-stats.js compareRates の形、before が無ければ null）
 *   crawlerLast: { botId: ISO }（_crawlers.js crawlerLastSeen）
 *   auditFresh: { checkedAt, items: [{check, page, problem, fix}] }
 * 返すのは [{ id, kind, level, title, detail, go }]。id は、同じ出来事なら同じ文字列です
 * （「確認しました」を覚えておくため）。
 */
export function seoAlerts({ latest, before, compare, crawlerLast, auditFresh, now = Date.now() } = {}) {
  const out = []
  const runAt = latest && (latest.finishedAt || latest.startedAt)

  // 1. 下がった（誤差を超えて）。名前が出た割合を優先し、そちらが動いていなければ候補の割合。
  if (latest && before && compare) {
    const pick = [['openMention', '名前が出る割合（社名の入っていない質問）'], ['recommend', '候補として挙がる割合（社名の入っていない質問）']]
      .find(([k]) => compare[k] && compare[k].change === 'down')
    if (pick) {
      const [k, label] = pick
      const c = compare[k]
      const b = c.before ? c.before.p : null, a = c.after ? c.after.p : null
      out.push({
        id: `drop:${k}:${latest.id}`, kind: 'drop', level: 'ng',
        title: `AIの回答で、${label}が下がりました（${pct(b)} → ${pct(a)}）`,
        detail: `前回（${md(before.finishedAt)}）と同じ質問・同じAIで比べて、誤差を超える差です。下の「前回との差」と「この計測から分かる、次の一手」を見てください。`,
        go: { tab: 'ai', id: 'seo-diff' },
      })
    }
  }

  // 2. 追い越された。前回は自社と同じか下だった会社が、今回は自社より多く挙がった。
  if (latest && before) {
    const now_ = tally(latest), then = tally(before)
    const passed = [...now_.others.entries()]
      .filter(([k, x]) => x.count >= OVERTAKE_MIN && x.count > now_.ours && (then.others.get(k) || { count: 0 }).count <= then.ours)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
    for (const [k, x] of passed) {
      const was = (then.others.get(k) || { count: 0 }).count
      out.push({
        id: `overtake:${k}:${latest.id}`, kind: 'overtake', level: 'ng',
        title: `「${x.name}」が、AIの回答で名前の挙がった回数で自社を追い越しました`,
        detail: `今回 ${x.name} ${x.count}回・自社 ${now_.ours}回（前回は ${was}回・自社 ${then.ours}回）。その会社が挙がった質問の回答を開くと、何を根拠に紹介されたかが分かります。`,
        go: { tab: 'ai', id: 'seo-comp' },
      })
    }
  }

  // 3. クローラーが来なくなった。
  const quiet = WATCH_BOTS
    .map((id) => ({ id, at: crawlerLast && crawlerLast[id] }))
    .filter((b) => b.at && now - Date.parse(b.at) > QUIET_DAYS * DAY)
  if (quiet.length) {
    out.push({
      id: `crawler:${quiet.map((b) => `${b.id}@${String(b.at).slice(0, 10)}`).join(',')}`, kind: 'crawler', level: 'warn',
      title: `AIのクローラーが${QUIET_DAYS}日以上来ていません（${quiet.map((b) => b.id).join('・')}）`,
      detail: quiet.map((b) => `${b.id} は ${md(b.at)} が最後`).join('、') +
        '。robots.txt やサイトの設定でこの名前を断っていないか確かめてください。断っていなければ、サイトマップを送り直し、新しいページを公開すると戻ってくることが多いです。',
      go: { tab: 'site', id: 'crawl-body' },
    })
  }

  // 4. 点検で、新しく「必ず直す」。
  const fresh = (auditFresh && Array.isArray(auditFresh.items) ? auditFresh.items : []).filter((f) => f && f.check)
  if (fresh.length) {
    const kinds = [...new Set(fresh.map((f) => f.problem || f.check))]
    out.push({
      id: `audit:${auditFresh.checkedAt || ''}:${fresh.length}`, kind: 'audit', level: 'warn',
      title: `サイトの点検で、新しく「必ず直す」が ${fresh.length}件 見つかりました`,
      detail: kinds.slice(0, 3).join('／') + (kinds.length > 3 ? ` ほか${kinds.length - 3}種類` : '') + `（${md(auditFresh.checkedAt)} の点検）。検索に載らなくなる原因になるものです。`,
      go: { tab: 'site', id: 'audit-body' },
    })
  }

  return out.map((a) => ({ ...a, at: a.kind === 'drop' || a.kind === 'overtake' ? runAt || null : null }))
}

/** 「確認しました」を覚えている id と照らして、まだ見ていないものに印を付けます。 */
export function markSeen(alerts, seen) {
  const s = new Set(Array.isArray(seen) ? seen : [])
  return alerts.map((a) => ({ ...a, fresh: !s.has(a.id) }))
}

/** 週次メールの一節。比べる材料が1つも無いとき（計測もクローラーの記録も点検も無い）は空。 */
export function alertLines(res) {
  if (!res || !res.checked) return []
  const lines = ['■ 検索・AIでの見え方の変化']
  const list = res.alerts || []
  if (!list.length) {
    lines.push('気になる変化はありませんでした（AIO計測の前回との差・競合・AIのクローラー・サイトの点検を見ています）。')
  } else {
    for (const a of list) lines.push(`・${a.title}`)
    lines.push('詳しくは管理画面の「SEO / AIO 分析」のいちばん上に出ています。')
  }
  return lines
}
