export const config = { runtime: 'edge' }

// 1分プレゼン（自己紹介のスライド）の中身。管理画面の「資料」で見せ、発表・印刷に使います。
//   GET                 -> { deck }（保存が無ければ既定の中身）
//   POST { deck }       -> 保存

import { requireAdmin, json } from './_admin-auth.js'
import { storeConfig, pipeline } from './_analytics-store.js'
import { KV } from './_brand.js'

const KEY = `${KV}present:deck`

export const DEFAULT_DECK = {
  event: '日本海側最大のマーケット 新潟⇔東京',
  number: 4, total: 9, seconds: 60,
  company: 'フェリシア', badge: '本システム開発者',
  name: '山本 捷真', honor: 'さん',
  title: 'Lumenium 代表/夢を叶えるシステム開発屋、売れるAI集客システム付きWebサイト制作、セキュリティ特化のAI研修、有名監督による企業PR動画・SNS運用',
  area: '東京・関東で対面 ・ オンラインは全国対応',
  targets: '人手が足りない経営者/人を雇いたい経営者/紙・Excel・電話で業務を回している中小企業や複数店舗の経営者(飲食・小売・サロン・士業事務所など)/AIを導入したいが何から始めるか決まっていない会社',
  topics: ['人手が足りない', '人が採れない', '手作業に時間がかかる', '社員にAIを使わせたい'],
  next: ['05 小林 末季こぱねぇ', '06 大場 雅俊', '07 床島 良夫'],
  photo: '/profile.jpg',
  idealFrom: '08:53', idealTo: '09:25', startAt: '08:21', endAt: '10:21',
}

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n)
const hm = (v) => (/^\d{1,2}:\d{2}$/.test(String(v || '').trim()) ? String(v).trim().padStart(5, '0') : '')
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }

export function cleanDeck(x) {
  const d = x && typeof x === 'object' ? x : {}
  const list = (v, n, each) => (Array.isArray(v) ? v : String(v || '').split(/\n|[、,，]/)).map((s) => clip(s, each)).filter(Boolean).slice(0, n)
  const photo = clip(d.photo, 500)
  return {
    event: clip(d.event, 80), number: int(d.number, 1, 99, 1), total: int(d.total, 1, 99, 1), seconds: int(d.seconds, 15, 600, 60),
    company: clip(d.company, 40), badge: clip(d.badge, 30), name: clip(d.name, 30), honor: clip(d.honor, 6),
    title: clip(d.title, 200), area: clip(d.area, 120), targets: clip(d.targets, 400),
    topics: list(d.topics, 8, 30), next: (Array.isArray(d.next) ? d.next : String(d.next || '').split('\n')).map((s) => clip(s, 40)).filter(Boolean).slice(0, 5),
    photo: /^(https:\/\/|\/(?!\/)|data:image\/(jpeg|png|webp);base64,)/.test(photo) ? photo : '',
    idealFrom: hm(d.idealFrom), idealTo: hm(d.idealTo), startAt: hm(d.startAt), endAt: hm(d.endAt),
  }
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  let deck = null
  if (cfg) {
    try { const [raw] = await pipeline(cfg, [['GET', KEY]]); deck = raw ? JSON.parse(raw) : null } catch (_) { deck = null }
  }
  return json({ ok: true, stored: !!cfg, saved: !!deck, deck: deck ? cleanDeck(deck) : DEFAULT_DECK })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const cfg = storeConfig()
  if (!cfg) return json({ ok: false, message: '保存先（Upstash Redis）が無いため保存できません。' }, 503)
  let b
  try { b = await req.json() } catch (_) { return json({ ok: false, message: '送られた内容を読めませんでした。' }, 400) }
  const deck = cleanDeck((b && b.deck) || {})
  if (deck.photo && deck.photo.length > 400000) return json({ ok: false, message: '写真が大きすぎます。小さくしてから選んでください。' }, 400)
  await pipeline(cfg, [['SET', KEY, JSON.stringify(deck)]])
  return json({ ok: true, deck, message: '保存しました。' })
}
