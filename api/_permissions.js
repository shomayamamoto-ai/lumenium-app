// 担当者の役割と、どの役割が何をできるかの表。
//
// requireAdmin（_admin-auth.js）が、ログインした人の役割と、呼ばれた窓口
// （/api/<名前>）・やり方（GET/POST…）・中身の action を、この表に当てて
// 決めます。窓口ごとに if を書き足さないための、ただ1つの表です。
//
//   オーナー   … 管理キー（ADMIN_KEY）で入った人。何でもできます。
//   管理者     … 担当者の管理とキーの設定のほかは、何でもできます。
//   担当者     … 問い合わせ・予約・SNS（承認の流れに沿って）・お知らせの下書き・
//                口コミの返信。設定や会員の書き出し・削除はできません。
//   閲覧のみ   … 見るだけ。保存・送信はできません。
//
// 表に無い窓口は「見るのは全員、書くのは管理者以上」。ただし、キー・設定・
// 担当者・共有リンク・会員の書き出しは、表の書き方にかかわらずオーナーだけ
// です（OWNER_AREAS）。新しい窓口を足すときに書き忘れても、危ない側には
// 倒れません。
//
// 共有リンク（?s=）で開いた人には、この表は当たりません。リンクの用途
// （scope）がそのまま範囲です。
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

export const ROLES = ['owner', 'manager', 'staff', 'viewer']
export const ROLE_LABEL = { owner: 'オーナー', manager: '管理者', staff: '担当者', viewer: '閲覧のみ' }
const RANK = { viewer: 0, staff: 1, manager: 2, owner: 3 }

/** 操作の記録の「どの画面」。 */
export const AREA_LABEL = {
  login: 'ログイン', inquiries: '問い合わせ', booking: '予約', reviews: '口コミ', sns: 'SNS',
  video: 'SNS（動画）', news: 'お知らせ', copy: '文章編集', members: '会員', analytics: 'アクセス解析',
  seo: 'SEO / AIO', advisor: 'AIアドバイザー', auto: '自動改善', settings: '設定・キー',
  staff: '担当者と権限', share: '共有リンク', audit: '操作の記録', other: 'その他',
}

/** どの役割でもオーナーだけ。表の書き間違いより強く効きます。 */
export const OWNER_AREAS = ['settings', 'staff', 'share']

// read: GET のとき / write: それ以外 / actions: 本文の action ごと /
// views: GET の ?view= ごと / methods: やり方ごと（read・write より先に見ます）。
// 値は「これ以上の役割なら可」。
export const TABLE = {
  'admin-ping': { area: 'login', read: 'viewer' },
  // 何がつながっているかだけ（値は返しません）。ポータルが全員分を読みます。
  health: { area: 'other', read: 'viewer' },
  settings: { area: 'settings', read: 'owner', write: 'owner' },
  'settings-test': { area: 'settings', write: 'owner' },
  'google-oauth': { area: 'settings', read: 'owner' },
  'video-oauth': { area: 'settings', read: 'owner' },
  staff: { area: 'staff', read: 'owner', write: 'owner' },
  'share-links': { area: 'share', read: 'owner', write: 'owner' },
  audit: { area: 'audit', read: 'manager' },

  inquiries: {
    area: 'inquiries', read: 'viewer', write: 'manager',
    methods: { PATCH: 'staff' },                         // 状態・メモ・担当・返信済み
    views: { export: 'manager', settings: 'manager' },   // CSV は個人の情報のかたまり
  },
  booking: { area: 'booking', read: 'viewer', write: 'manager', methods: { PATCH: 'staff' } },
  reviews: {
    area: 'reviews', read: 'viewer', write: 'manager',
    actions: { sync: 'staff', reply: 'staff', 'reply-delete': 'staff', draft: 'staff', 'request-send': 'staff' },
  },
  social: {
    area: 'sns', read: 'viewer', write: 'manager',
    // 担当者は「承認をお願いする」まで。承認されたものは担当者も出せます
    // （出せるのは承認済みだけ、という確認は api/social.js がします）。
    actions: {
      'approval-create': 'staff', 'approval-send': 'staff', 'approval-schedule': 'staff', 'approval-delete': 'staff',
      metrics: 'staff', inbox: 'staff', 'inbox-reply': 'staff',
    },
  },
  'social-write': { area: 'sns', write: 'staff' },   // AIの下書き（出しはしません）
  'social-upload': { area: 'sns', write: 'staff' },  // 投稿に添える画像
  'social-plan': { area: 'sns', read: 'viewer', write: 'manager' },
  'news-post': { area: 'news', read: 'viewer', write: 'manager', actions: { 'draft-save': 'staff', 'draft-delete': 'staff' } },
  'content-save': { area: 'copy', read: 'viewer', write: 'manager' },
  rewrite: { area: 'copy', write: 'manager' },
  'deploy-status': { area: 'copy', read: 'viewer' },
  'members-list': { area: 'members', read: 'viewer' },
  members: { area: 'members', read: 'viewer', write: 'manager', actions: { delete: 'owner' } },
  'members-xlsx': { area: 'members', read: 'owner' },  // 書き出し
  'members-view': { area: 'members', read: 'owner' },  // 書き出し（表で見る）
  video: { area: 'video', read: 'viewer', write: 'manager' },
  'video-publish': { area: 'video', read: 'viewer', write: 'manager' },
  'video-upload': { area: 'video', write: 'manager' },
  analytics: { area: 'analytics', read: 'viewer' },
  'weekly-report': { area: 'analytics', read: 'viewer', write: 'manager' },
  'search-console': { area: 'seo', read: 'viewer' },
  crawlers: { area: 'seo', read: 'viewer' },
  'site-audit': { area: 'seo', read: 'viewer' },
  aio: { area: 'seo', read: 'viewer', write: 'manager' },
  'listing-check': { area: 'seo', write: 'manager' },
  indexnow: { area: 'seo', read: 'viewer', write: 'manager' },
  // 相談は保存も送信もしないので、担当者も使えます（料金がかかるので閲覧のみは不可）。
  // 1通ごとに記録すると記録があふれるため、相談そのものは記録しません（quiet）。
  advisor: { area: 'advisor', write: 'staff', quiet: true },
  'advisor-store': { area: 'advisor', read: 'viewer', write: 'staff' },
  auto: { area: 'auto', read: 'viewer', write: 'manager' },
}

const DEFAULT_READ = 'viewer'
const DEFAULT_WRITE = 'manager'

export function isRead(method) {
  const m = String(method || 'GET').toUpperCase()
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS'
}

/** /api/<名前> の <名前>。それ以外の形なら ''。 */
export function endpointOf(pathname) {
  const m = /^\/api\/([a-z0-9-]+)\/?$/i.exec(String(pathname || ''))
  return m ? m[1].toLowerCase() : ''
}

export function roleOk(role) {
  return Object.prototype.hasOwnProperty.call(RANK, role)
}

/** その操作に要る役割（いちばん低いもの）。 */
export function needed({ endpoint, method, action, view }) {
  const rule = TABLE[endpoint] || null
  const read = isRead(method)
  const area = (rule && rule.area) || 'other'
  if (OWNER_AREAS.includes(area)) return 'owner'
  if (!rule) return read ? DEFAULT_READ : DEFAULT_WRITE
  const m = String(method || 'GET').toUpperCase()
  if (read && view && rule.views && rule.views[view]) return rule.views[view]
  if (!read && action && rule.actions && rule.actions[action]) return rule.actions[action]
  if (rule.methods && rule.methods[m]) return rule.methods[m]
  if (read) return rule.read || DEFAULT_READ
  return rule.write || DEFAULT_WRITE
}

/** 決めるところ。{ allow, need, area, message } */
export function decide({ role, endpoint, method, action, view }) {
  const rule = TABLE[endpoint] || null
  const area = (rule && rule.area) || 'other'
  const need = needed({ endpoint, method, action, view })
  const allow = roleOk(role) && RANK[role] >= RANK[need]
  return { allow, need, area, quiet: !!(rule && rule.quiet), message: allow ? '' : refusal(need, role) }
}

/** 断るときの一言。画面にそのまま出ます。 */
export function refusal(need, role) {
  if (role === 'viewer' && need !== 'owner') return '閲覧のみの役割のため、この操作はできません。必要なら管理者に頼んでください。'
  if (need === 'owner') return 'この操作はオーナーだけが使えます。'
  if (need === 'manager') return 'この操作は管理者以上が使えます。'
  return 'この操作は担当者以上が使えます。'
}

export function areaOf(endpoint) {
  return (TABLE[endpoint] && TABLE[endpoint].area) || 'other'
}
