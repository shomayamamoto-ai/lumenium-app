// 文章の上書きの住所（パス）を「何番目」から「どの項目」に。
//
//   古い: site.TESTIMONIALS.1.text          （配列の2番目）
//   新しい: site.TESTIMONIALS.@voice-p8q48v.text （id が voice-p8q48v の項目）
//
// 何番目で書くと、データの並びを入れ替えたり1件足したりしただけで、上書きが
// 隣の項目に付きます（別のお客様の声に、別の人の言葉が載る）。id で書けば、
// 並びが変わっても同じ項目に付いたままです。
//
// 古い書き方の上書きは、読むとき（applyOverrides）と次に保存するとき
// （api/content-save.js）に新しい書き方へ読み替えます。読み替えには、id に
// 切り替えた時点の並び順（content-legacy-order.js）を使います。いまの並び順
// を使うと、並べ替えたあとに読み替えたときに、まさに防ぎたい取り違えが起きます。
//
// No imports of the data modules, so the edge function can use it as is.

import { LEGACY_ORDER } from './content-legacy-order.js'

/** id の区切り（パスの1区切りが "@" で始まると id）。 */
export const ID_SEG = /^@[A-Za-z0-9_-]+$/

/** 配列の項目の id。id が無ければ key（料金シミュレーターの項目）。 */
export function itemId(item) {
  if (!item || typeof item !== 'object') return null
  if (item.id != null && item.id !== '') return String(item.id)
  if (item.key != null && item.key !== '') return String(item.key)
  return null
}

/** 配列のすべての項目に id があるか（あれば id の住所で書く）。 */
export function idArray(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.every((x) => itemId(x) != null)
}

/**
 * 古い住所を新しい住所に。読み替えの要らない住所はそのまま返します。
 * 読み替えられない（その番号の項目が、切り替えた時点に無かった）ときは null。
 */
export function migratePath(path, legacy = LEGACY_ORDER) {
  const parts = String(path).split('.')
  const out = []
  for (const seg of parts) {
    const prefix = out.join('.')
    if (/^\d+$/.test(seg) && legacy[prefix]) {
      const id = legacy[prefix][Number(seg)]
      if (id == null) return null
      out.push('@' + id)
    } else {
      out.push(seg)
    }
  }
  return out.join('.')
}

/** 上書き全体の読み替え。{ out, moved }。同じ項目に新旧両方あれば新しい方を残します。 */
export function migrateOverrides(overrides, legacy = LEGACY_ORDER) {
  const out = {}
  let moved = 0
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return { out, moved }
  // 新しい書き方のものを先に入れ、古い書き方は空いているところにだけ入れる
  const keys = Object.keys(overrides)
  for (const k of keys) if (typeof overrides[k] !== 'string' || migratePath(k, legacy) === k) out[k] = overrides[k]
  for (const k of keys) {
    if (typeof overrides[k] !== 'string') continue
    const m = migratePath(k, legacy)
    if (m === k) continue
    moved++
    if (m && !(m in out)) out[m] = overrides[k]
  }
  return { out, moved }
}
