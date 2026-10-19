// お店のプロフィール（オーナーが書くもの）。AIアドバイザーなど、AIが文を作るときの前提にします。
//
// このサイトの事業の説明（src/data/services.js）は、作った会社のものです。サイトを
// 別のお店が使うとき、コードを直さずに「うちの店はこう」と伝えられるようにする場所です。
// 個人の情報は入れません（お店のことだけ）。
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

import { pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'

export const PROFILE_KEY = `${KV}shop:profile`

/** 欄（キー・見出し・例・長さ）。画面とAIへの渡し方の両方で使います。 */
export const PROFILE_FIELDS = [
  ['kind', '業種', '例：美容室／整体院／税理士事務所／工務店／カフェ', 60],
  ['area', '地域・お店の場所', '例：横浜市青葉区（たまプラーザ駅から徒歩3分）', 80],
  ['customers', 'おもなお客様', '例：30〜50代の女性。子育て中で平日昼に来る方が多い', 200],
  ['strengths', 'お店の強み・選ばれる理由', '例：完全予約制で待ち時間なし。髪の悩みの相談に時間をかける', 300],
  ['price', '価格帯', '例：カット 4,400円〜。地域では中くらい', 120],
  ['hours', '営業時間・定休日', '例：10〜19時・火曜定休', 80],
  ['goals', 'いまの目標', '例：平日の昼の予約を増やしたい。口コミを月5件', 200],
  ['avoid', '使わない言葉・言わないこと', '例：「激安」「No.1」は使わない。他店の悪口は書かない', 200],
  ['notes', 'ほかに伝えておきたいこと', '例：来年春に2号店を出す予定（まだ公表しない）', 300],
]

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n)

export function cleanProfile(input) {
  const x = input && typeof input === 'object' ? input : {}
  const out = {}
  for (const [k, , , n] of PROFILE_FIELDS) out[k] = clip(x[k], n)
  return out
}

export function profileFilled(p) {
  return !!p && PROFILE_FIELDS.some(([k]) => p[k])
}

/** AIへ渡す文。空の欄は書きません。 */
export function profileText(p) {
  if (!profileFilled(p)) return ''
  return PROFILE_FIELDS.filter(([k]) => p[k]).map(([k, label]) => `${label}: ${p[k]}`).join('\n')
}

export async function readProfile(cfg) {
  if (!cfg) return cleanProfile({})
  try {
    const [raw] = await pipeline(cfg, [['GET', PROFILE_KEY]])
    return cleanProfile(raw ? JSON.parse(raw) : {})
  } catch (_) { return cleanProfile({}) }
}

export async function saveProfile(cfg, input) {
  const p = cleanProfile(input)
  p.updatedAt = new Date().toISOString()
  await pipeline(cfg, [['SET', PROFILE_KEY, JSON.stringify(p)]])
  return p
}
