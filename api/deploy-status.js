export const config = { runtime: 'edge' }

// 保存したものがサイトに出たか、を GitHub に聞きます。
//
// お知らせや文章を保存すると GitHub にコミットされ、Vercel がそれを見て
// サイトを作り直します（約1〜2分）。この作り直し（ビルド）が失敗すると、
// 管理画面は「保存しました」のまま、サイトは古いまま——誰も気づきません。
// 実際、ビルドが止まって何日も更新が届かなかったことがあります。
//
// Vercel は GitHub 連携で、コミットごとに「状態（commit status）」か
// 「チェック（check run）」を書き込みます。それを既存の GITHUB_TOKEN で
// 読むだけです（何も書き込みません）。
//
// GET /api/deploy-status?sha=<コミット>
//   → { ok, state: 'building' | 'live' | 'failed' | 'none' | 'unknown', url, message }

import { requireAdmin, json } from './_admin-auth.js'
import { setting } from './_settings.js'
import { gh, repoName } from './_github.js'

const isVercel = (s) => /vercel/i.test(String(s || ''))

/** GitHub の2つの答えを、画面に出す1つの状態にまとめます。 */
export function deployState(status, checks) {
  const st = ((status && status.statuses) || []).map((s) => ({
    name: s.context, url: s.target_url,
    state: s.state === 'success' ? 'live' : (s.state === 'failure' || s.state === 'error') ? 'failed' : 'building',
  }))
  const cr = ((checks && checks.check_runs) || []).map((c) => ({
    name: c.name, url: c.details_url || c.html_url,
    state: c.status !== 'completed'
      ? 'building'
      : (c.conclusion === 'success' || c.conclusion === 'neutral' || c.conclusion === 'skipped')
        ? 'live'
        : 'failed',
  }))
  let all = [...st, ...cr]
  // Vercel のものがあればそれだけを見ます（ほかの自動チェックの失敗で
  // 「サイトの更新に失敗」と言わないように）。
  const v = all.filter((x) => isVercel(x.name))
  if (v.length) all = v
  if (!all.length) return { state: 'none', url: null }
  const failed = all.find((x) => x.state === 'failed')
  if (failed) return { state: 'failed', url: failed.url || null }
  const building = all.find((x) => x.state === 'building')
  if (building) return { state: 'building', url: building.url || null }
  return { state: 'live', url: (all.find((x) => x.url) || {}).url || null }
}

export async function GET(req) {
  const denied = await requireAdmin(req)
  if (denied) return denied

  const sha = String(new URL(req.url).searchParams.get('sha') || '')
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) return json({ ok: false, message: 'コミットの指定が正しくありません。' }, 400)

  const token = await setting('GITHUB_TOKEN', '', req)
  if (!token) return json({ ok: false, code: 'GITHUB_NOT_CONFIGURED', message: 'GITHUB_TOKEN が未設定です。' }, 503)
  const repo = repoName()

  const [a, b] = await Promise.all([
    gh(token, repo, `commits/${sha}/status`).catch(() => null),
    gh(token, repo, `commits/${sha}/check-runs`).catch(() => null),
  ])
  if ((!a || !a.ok) && (!b || !b.ok)) {
    const denied403 = (a && (a.status === 403 || a.status === 404)) || (b && (b.status === 403 || b.status === 404))
    return json({
      ok: true, state: 'unknown', url: null,
      message: denied403
        ? 'サイトの更新状況を読めませんでした。GitHub のトークンに「Commit statuses」と「Checks」の読み取り権限を足すと、ここに表示されます。'
        : 'サイトの更新状況を確認できませんでした。少し時間をおいて画面を再読み込みしてください。',
    })
  }
  const status = a && a.ok ? await a.json().catch(() => null) : null
  const checks = b && b.ok ? await b.json().catch(() => null) : null
  const out = deployState(status, checks)
  const MSG = {
    building: '反映中です（サイトを作り直しています。通常1〜2分）。',
    live: 'サイトに反映済みです。',
    failed: 'サイトの更新（ビルド）が失敗しました。保存した内容はまだサイトに出ていません。担当者に連絡してください。',
    none: '反映待ちです（サイトの作り直しが始まるのを待っています）。',
  }
  return json({ ok: true, ...out, message: MSG[out.state] })
}
