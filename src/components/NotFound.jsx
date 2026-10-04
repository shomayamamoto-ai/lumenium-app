import { useEffect } from 'react'

/* 存在しない住所に来た人への画面。
   サーバーはどんな住所にもトップページを返す設定なので、これまでは打ち間違いや
   消したページへのリンクでも、何事もなかったようにトップが出ていました。
   来た人は探していたものが無いことに気づけず、こちらはリンク切れに気づけません。
   どちらにも「無い」と正直に伝えて、行き先を3つだけ出します。 */
export default function NotFound() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = 'ページが見つかりません | Lumenium'
    // 中身はトップと同じ住所の別物なので、検索結果に載せないように。
    // index.html の robots（index, follow…）を書き換えます。もう1つ足すと
    // 「載せて」と「載せないで」が同じページに並びます。
    const existing = document.head.querySelector('meta[name="robots"]')
    const meta = existing || document.createElement('meta')
    const prevRobots = existing ? existing.getAttribute('content') : null
    meta.setAttribute('name', 'robots')
    meta.setAttribute('content', 'noindex')
    if (!existing) document.head.appendChild(meta)
    return () => {
      document.title = prevTitle
      if (existing) existing.setAttribute('content', prevRobots)
      else meta.remove()
    }
  }, [])

  return (
    <div className="lp">
      <section className="lp-hero" aria-labelledby="nf-h">
        <div className="lp-wrap">
          <p className="lp-eyebrow">404 — Page Not Found</p>
          <h1 className="lp-h1" id="nf-h">お探しのページは見つかりませんでした</h1>
          <p className="lp-lead">
            ページが移動したか、削除された可能性があります。アドレスに打ち間違いがないかもご確認ください。
          </p>
          <div className="lp-actions">
            <a href="/" className="lp-btn lp-btn--primary">トップページへ</a>
            <a href="/services/index.html" className="lp-btn lp-btn--ghost">サービス一覧</a>
            <a href="/#contact" className="lp-btn lp-btn--ghost">お問い合わせ</a>
          </div>
        </div>
      </section>
    </div>
  )
}
