export const config = { runtime: 'edge' }

// Reading and writing the keys the admin can enter.
//
// Admin key only, by the header only — this endpoint sets credentials, so it
// must not be reachable by a share link or by a key in a URL.
//
//   GET                                -> { ready, settings }
//   POST { name, value }               -> save (empty value clears it)
//
// Where a value goes depends on what exists. With Upstash connected it goes
// into the store and every browser and every visitor's request sees it. With
// no store it goes into this browser, encrypted, as a cookie — which covers
// the keys that are only ever read while serving the admin's own requests.
// The ones a visitor's request needs (contact mail, the member code, the
// session secret) cannot work that way, and say so rather than appearing to
// save.
//
// A saved value is never returned. The status carries only whether one is set,
// where it came from, and its last four characters so two keys can be told
// apart.

import { requireAdmin, json } from './_admin-auth.js'
import {
  settingStatus, saveSetting, storeReady, deviceReady, canGoOnDevice, SETTINGS, GROUPS,
} from './_settings.js'
import { cookieFor } from './_keybag.js'
import { storeConfig } from './_analytics-store.js'

const NO_HOME = {
  ok: false,
  code: 'NO_WHERE_TO_PUT_IT',
  message:
    'この項目はこの画面からは保存できません。訪問者のリクエストを処理するときに使う値なので、'
    + 'この端末のブラウザに置いても効きません。Vercel の環境変数に設定するか、Upstash Redis を接続してください。',
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const ready = await storeReady(req)
  const device = await deviceReady()
  const settings = await settingStatus(req)
  return json({
    ok: true,
    ready,
    device,
    groups: GROUPS,
    settings,
    message: ready ? '' : (device
      ? 'キーの保存先（Upstash Redis）は未接続です。下の入力欄は、このブラウザにだけ保存する形で使えます。'
        + 'ほかの端末では使えず、印の付いた項目（問い合わせメール・会員コード・署名鍵）は訪問者側で読まれるため対象外です。'
      : '保存先も端末保存も使えません。'),
  })
}

export async function POST(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  let body
  try { body = await req.json() } catch (_) { return json({ ok: false, message: '不正なリクエストです。' }, 400) }

  const name = String((body && body.name) || '')
  if (!SETTINGS.some((s) => s.name === name)) {
    return json({ ok: false, message: 'この項目は設定できません。' }, 400)
  }
  const value = String((body && body.value) || '')
  if (value.length > 4000) return json({ ok: false, message: '値が長すぎます。' }, 400)

  // The shared store first: a key everyone should see belongs where everyone
  // can see it.
  // Not for the store's own address: saving that into the store it addresses
  // is circular, and the browser is where it belongs.
  const STORE_KEYS = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
  // A store reachable only because this browser is carrying its address is a
  // store that visitors' requests cannot reach either. Writing a visitor-side
  // key into it would report 「保存しました」 for something the contact form
  // still cannot read, so those keys are refused here exactly as they are
  // when there is no store at all — with the message that names the remedy.
  const envStore = !!storeConfig()
  const usable = envStore || (canGoOnDevice(name) && await storeReady(req))
  if (!STORE_KEYS.includes(name) && usable) {
    try {
      const res = await saveSetting(name, value, req)
      if (!res.ok) return json({ ok: false, message: res.message }, 502)
      return json({
        ok: true,
        cleared: res.cleared,
        where: 'saved',
        groups: GROUPS,
        settings: await settingStatus(req),
        message: res.cleared
          ? '削除しました。環境変数が設定されていればそちらが使われます。'
          : '保存しました。すぐに反映されます（再デプロイは不要です）。',
      })
    } catch (_) {
      return json({ ok: false, message: '保存に失敗しました。時間をおいて再度お試しください。' }, 502)
    }
  }

  // No store. This browser, then — for the keys that are only read on the
  // admin's own requests.
  if (!canGoOnDevice(name)) return json(NO_HOME, 503)
  if (!(await deviceReady())) return json({ ...NO_HOME, message: 'この端末に保存できませんでした。' }, 503)

  const cookie = await cookieFor(name, value.trim())
  if (!cookie) return json({ ...NO_HOME, message: 'この端末に保存できませんでした。' }, 503)

  // The status is built from the request that just arrived, which does not
  // carry the cookie being set — so patch this one row rather than reporting
  // the value as still missing.
  const settings = (await settingStatus(req)).map((s) => {
    if (s.name !== name) return s
    const v = value.trim()
    if (!v) return { ...s, set: false, from: null, hint: '' }
    return { ...s, set: true, from: 'device', hint: s.kind === 'text' ? v : '••••' + v.slice(-4) }
  })

  return json({
    ok: true,
    cleared: !value.trim(),
    where: 'device',
    groups: GROUPS,
    settings,
    message: value.trim()
      ? 'このブラウザに保存しました。すぐに使えます（再デプロイ不要）。ほかの端末からは使えません。'
      : 'このブラウザから削除しました。',
  }, 200, { 'set-cookie': cookie })
}
