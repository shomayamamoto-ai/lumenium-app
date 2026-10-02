import { useEffect, useState } from 'react'
import { funnel } from '../lib/analytics'

/**
 * 空き日時をその場で予約する。
 *
 * アクセス解析で、お問い合わせの場所まで来た人の半分以上が、文章を書く前に
 * 帰っていました。「何をどう書くか」を考えるより先に、「この時間に30分
 * 話す」を選ぶほうが軽い。直近の空き（予定の前後30分をあけたもの）を日を
 * 分けて3つ並べ、押したらお名前とメールアドレスだけで確定します。
 *
 * 予約の仕組みが動いていないとき（枠が取れないとき）は、何も出しません。
 */
export default function QuickBook() {
  const [state, setState] = useState('loading') // loading | open | done | off
  const [slots, setSlots] = useState([])
  const [all, setAll] = useState(false)
  const [picked, setPicked] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const load = async (wantAll) => {
    try {
      const res = await fetch('/api/booking' + (wantAll ? '?all=1' : ''))
      const data = await res.json()
      if (!data.ok || !data.enabled || !data.slots.length) { if (!wantAll) setState('off'); return }
      setSlots(data.slots)
      setState('open')
      if (!wantAll) funnel.bookingView()
    } catch (_) {
      if (!wantAll) setState('off')
    }
  }
  useEffect(() => { load(false) }, [])

  // 最初は日を分けて3つ。同じ日の30分違いが並ぶより、選びやすい。
  const shown = all ? slots : (() => {
    const out = []
    const days = new Set()
    for (const s of slots) {
      if (days.has(s.day)) continue
      days.add(s.day); out.push(s)
      if (out.length === 3) break
    }
    return out
  })()

  const pick = (s) => {
    setPicked(s)
    setError('')
    funnel.contactStart()
    setTimeout(() => { const el = document.getElementById('qb-name'); if (el) el.focus() }, 0)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { setError('お名前を入力してください。'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('メールアドレスを確認してください。'); return }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: picked.key, name: name.trim(), email: email.trim(),
          message: 'トップページの「空き日時」からオンライン相談を予約しました。',
          company: '', topics: [], website: '',
          page: typeof window !== 'undefined' ? window.location.pathname + window.location.hash : '',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setError(data.message || 'その枠は埋まりました。別の日時をお選びください。')
        setPicked(null)
        await load(all)
        return
      }
      if (!res.ok || !data.ok) throw new Error(data.message || `status ${res.status}`)
      funnel.bookingConfirm()
      setResult(data)
      setState('done')
    } catch (_) {
      setError('予約できませんでした。お手数ですが、下のフォームからご連絡ください。')
    } finally {
      setSending(false)
    }
  }

  if (state === 'loading' || state === 'off') return null

  return (
    <section className="qb" aria-labelledby="qb-h">
      <div className="lp-wrap qb-in">
        {state === 'done' ? (
          <div className="qb-done" role="status">
            <p className="qb-h" id="qb-h">ご予約ありがとうございます</p>
            <p className="qb-when">{result.when}（日本時間）</p>
            <p className="qb-note">
              {result.invited
                ? 'カレンダーへの登録と招待メールの送信まで完了しました。当日はメールのURLからご参加ください。'
                : 'お席を確保しました。オンライン会議のURLを添えて、確定のご連絡をお送りします。'}
            </p>
          </div>
        ) : (
          <>
            <div className="qb-head">
              <h2 className="qb-h" id="qb-h">無料のオンライン相談を、いま予約する</h2>
              <p className="qb-lead">文章を書かなくても大丈夫です。日時を選んで、お名前とメールアドレスを入れるだけ。お時間は最大1時間、費用はかかりません。</p>
            </div>
            <div className="qb-slots">
              {shown.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`qb-slot ${picked && picked.key === s.key ? 'is-on' : ''}`}
                  aria-pressed={!!(picked && picked.key === s.key)}
                  onClick={() => pick(s)}
                >
                  <span className="qb-day">{s.day}</span>
                  <span className="qb-time">{s.time}</span>
                </button>
              ))}
              {!all && slots.length > shown.length ? (
                <button type="button" className="qb-more" onClick={() => { setAll(true); load(true) }}>ほかの日時を見る</button>
              ) : null}
            </div>
            {error ? <p className="qb-error" role="alert">{error}</p> : null}
            {picked ? (
              <form className="qb-form" onSubmit={submit} noValidate>
                <p className="qb-picked">{picked.day} {picked.time} で予約します</p>
                <label>
                  お名前
                  <input id="qb-name" type="text" autoComplete="name" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" />
                </label>
                <label>
                  メールアドレス
                  <input type="email" autoComplete="email" maxLength={100} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
                </label>
                <button type="submit" className="lp-btn lp-btn--primary" disabled={sending}>{sending ? '予約しています…' : 'この日時で予約する'}</button>
              </form>
            ) : null}
            <p className="qb-alt">日時がまだ決められない方は、下のフォームからどうぞ。</p>
          </>
        )}
      </div>
    </section>
  )
}
