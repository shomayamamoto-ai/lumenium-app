// Claude を呼ぶときの共通の入口。
//
// 断られた答えを別のモデルで続ける指定（server-side fallback）を付けて
// 送ります。ただ、この指定はベータで、API 側が受け付けない時期や
// アカウントがありえます。受け付けなかった（400）ときに機能ごと止まると
// 「AIの下書きが作れない」になるので、指定を外した普通の呼び出しで
// 1回だけ送り直します。
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }

export async function createWithFallback(client, params) {
  try {
    return await client.beta.messages.create({ ...params, ...FALLBACK })
  } catch (e) {
    if (e && e.status === 400) return client.messages.create(params)
    throw e
  }
}
