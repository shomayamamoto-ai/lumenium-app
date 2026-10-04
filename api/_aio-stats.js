// How sure a rate is, and whether two rates really differ.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.
//
// An answer engine does not give the same answer twice. Asked the same
// question again, it names a different set of companies a sizeable share of
// the time — published measurements put run-to-run variation at roughly 10 to
// 34 percent. So a single run's "42%" is one draw, and "38% last month, 42%
// now" is usually nothing at all. The report says how wide each number could
// reasonably be, and calls a change a change only when it is bigger than that.

const Z = 1.96 // 95%

/** Wilson score interval for k hits out of n. Chosen over the textbook
 *  p ± z·√(p(1−p)/n) because that one collapses to "0% to 0%" when nothing
 *  was found — which is exactly the case this tool sees most, and the one
 *  where claiming certainty would be most misleading. */
export function wilson(k, n, z = Z) {
  if (!n) return { lo: 0, hi: 1 }
  const p = k / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) }
}

/** A rate with its range, in the shape the report stores. */
export function rate(k, n) {
  const { lo, hi } = wilson(k, n)
  return { k, n, p: n ? k / n : 0, lo, hi }
}

/** Did the rate move between two runs, beyond what chance alone would do?
 *
 *  A two-proportion z-test at 95%. "same" means 誤差の範囲 — not "nothing
 *  changed", but "this much change happens by chance". Either side with no
 *  samples is "na": there is nothing to compare. */
export function compareRates(before, after) {
  if (!before || !after || !before.n || !after.n) return { change: 'na', diff: 0, z: 0 }
  const p1 = before.k / before.n
  const p2 = after.k / after.n
  const pool = (before.k + after.k) / (before.n + after.n)
  const se = Math.sqrt(pool * (1 - pool) * (1 / before.n + 1 / after.n))
  const diff = p2 - p1
  // Both at 0% (or both at 100%) has no spread at all; it is "same".
  const z = se ? diff / se : 0
  const change = Math.abs(z) > Z ? (diff > 0 ? 'up' : 'down') : 'same'
  return { change, diff, z }
}
