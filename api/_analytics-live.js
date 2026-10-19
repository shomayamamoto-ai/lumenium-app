// 「いまサイトにいる人」。最近5分に動きのあった人の数と、いま見られているページ。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// 数え方は日ごとの訪問者と同じです。beacon（track.js）が1分ごとの
// HyperLogLog に、その日だけ有効な符号を入れ、読むときは5つの入れ物を
// まとめて数えます（PFCOUNT に複数の鍵を渡すと、重なりを除いた人数に
// なります）。HyperLogLog は数を数えるだけの仕組みで、入れた符号を
// 取り出すことはできません。入れ物は10分で消えます。
//
// ページは、その1分に開かれた回数を数えるだけです。どの人がどのページに
// いるかは、記録にも画面にもありません。

export const LIVE_MINUTES = 5
// 読む窓（5分）より少し長く残します。最後の1分を読む前に消えないように。
export const LIVE_TTL = 10 * 60
export const LIVE_TOP = 5

/** 時刻 → 1分ごとの入れ物の番号（UTC の通しの分）。 */
export const minuteOf = (ms) => Math.floor(Number(ms) / 60000)

/** いまの1分に「いた」ことを書く。path は閲覧のときだけ（読み進めた・時間の
 *  合図は人数にだけ入れます）。vid が無ければ何も書きません。 */
export function liveCommands(K, ms, vid, path) {
  if (!vid) return []
  const m = minuteOf(ms)
  const cmds = [
    ['PFADD', K.liveVisitors(m), vid],
    ['EXPIRE', K.liveVisitors(m), LIVE_TTL],
  ]
  if (path) cmds.push(['HINCRBY', K.livePaths(m), path, 1], ['EXPIRE', K.livePaths(m), LIVE_TTL])
  return cmds
}

/** 読むときの命令。人数を1つ、そのあと5分ぶんのページの数。 */
export function liveReadCommands(K, ms, n = LIVE_MINUTES) {
  const now = minuteOf(ms)
  const mins = Array.from({ length: n }, (_, i) => now - i)
  return [['PFCOUNT', ...mins.map((m) => K.liveVisitors(m))], ...mins.map((m) => ['HGETALL', K.livePaths(m)])]
}

const asPairs = (v) => {
  if (!v) return []
  if (Array.isArray(v)) {
    const out = []
    for (let i = 0; i + 1 < v.length; i += 2) out.push([String(v[i]), Number(v[i + 1]) || 0])
    return out
  }
  return Object.entries(v).map(([k, x]) => [k, Number(x) || 0])
}

/** 読んだ結果を、画面に出す形に。 */
export function liveSummary(raw, n = LIVE_MINUTES) {
  const count = Math.max(0, Number(raw && raw[0]) || 0)
  const tally = new Map()
  for (const h of (raw || []).slice(1, 1 + n)) {
    for (const [p, c] of asPairs(h)) tally.set(p, (tally.get(p) || 0) + c)
  }
  const pages = [...tally.entries()]
    .filter(([, c]) => c > 0)
    .map(([name, views]) => ({ name, views }))
    .sort((a, b) => b.views - a.views || (a.name < b.name ? -1 : 1))
    .slice(0, LIVE_TOP)
  return { count, pages, minutes: n }
}
