import { useEffect, useRef, useState } from 'react'
import { funnel, whenSeen } from '../lib/analytics'
import { bookingCopy } from './bookingCopy'
import { textFor } from '../lib/experiments'

/**
 * 空き日時をその場で予約する。
 *
 * アクセス解析で、お問い合わせの場所まで来た人の半分以上が、文章を書く前に
 * 帰っていました。「何をどう書くか」を考えるより先に、「この時間に
 * 話す」を選ぶほうが軽い。直近の空き（予定の前後をあけたもの）を日を
 * 分けて3つ並べ、押したらお名前とメールアドレスだけで確定します。
 * 長さ・呼び方・メニューは管理画面の「予約管理」で決めたもので、ここに
 * 「30分」のような数字は書きません（サーバーが返す minutes を使います）。
 * メニューが2つ以上あるときだけ、先にメニューを選んでもらいます。
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
  const [info, setInfo] = useState(null)       // minutes / wording / services / service
  const boxRef = useRef(null)

  const load = async (wantAll, service) => {
    try {
      const q = new URLSearchParams()
      if (wantAll) q.set('all', '1')
      if (service) q.set('service', service)
      const res = await fetch('/api/booking' + (q.toString() ? '?' + q.toString() : ''))
      const data = await res.json()
      if (!data.ok || !data.enabled) { if (!wantAll && !service) setState('off'); return }
      // メニューを選び直して空きが無いときは、箱ごと消さずに「空きがありません」と出す。
      if (!data.slots.length && !service) { if (!wantAll) setState('off'); return }
      setInfo({ minutes: data.minutes, wording: data.wording, online: data.online, mode: data.mode, services: data.services || [], service: data.service })
      setSlots(data.slots)
      setState('open')
    } catch (_) {
      if (!wantAll && !service) setState('off')
    }
  }
  const chooseService = (id) => {
    setPicked(null)
    setAll(false)
    setInfo((x) => ({ ...x, service: id }))
    load(false, id)
  }
  useEffect(() => { load(false) }, [])
  // 「日程候補を見た」は、候補が実際に画面に入ったときに1回だけ。読み込めた
  // だけで数えると、ページの下まで来ていない人も「見た」ことになります。
  useEffect(() => (state === 'open' ? whenSeen(boxRef.current, funnel.bookingView) : undefined), [state])

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
          key: picked.key, service: info && info.service, name: name.trim(), email: email.trim(),
          message: 'トップページの「空き日時」から予約しました。',
          company: '', topics: [], website: '',
          page: typeof window !== 'undefined' ? window.location.pathname + window.location.hash : '',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setError(data.message || 'その枠は埋まりました。別の日時をお選びください。')
        setPicked(null)
        await load(all, info && info.service)
        return
      }
      if (!res.ok || !data.ok) throw new Error(data.message || `status ${res.status}`)
      // 予約が取れた＝問い合わせが1件来た、です。フォームを通っていない
      // だけで、成果としては同じなので、送信としても数えます。
      funnel.contactSubmit()
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
  const copy = bookingCopy(info)

  return (
    <section className="qb" aria-labelledby="qb-h" ref={boxRef}>
      <div className="lp-wrap qb-in">
        {state === 'done' ? (
          <div className="qb-done" role="status">
            <p className="qb-h" id="qb-h">ご予約ありがとうございます</p>
            <p className="qb-when">{result.when}（日本時間）</p>
            <p className="qb-note">
              {result.invited ? copy.doneInvited : copy.doneHeld}
            </p>
          </div>
        ) : (
          <>
            <div className="qb-head">
              <h2 className="qb-h" id="qb-h">{textFor('booking.heading', copy.heading)}</h2>
              <p className="qb-lead">文章を書かなくても大丈夫です。日時を選んで、お名前とメールアドレスを入れるだけ。{copy.length}</p>
            </div>
            {copy.services.length > 1 ? (
              <div className="qb-svcs" role="group" aria-label="メニュー">
                {copy.services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`qb-slot qb-svc ${info.service === s.id ? 'is-on' : ''}`}
                    aria-pressed={info.service === s.id}
                    onClick={() => chooseService(s.id)}
                  >
                    <span className="qb-time">{s.name}</span>
                    <span className="qb-day">{s.minutes}分{s.price ? `・${s.price}` : ''}</span>
                    {s.desc ? <span className="qb-day">{s.desc}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="qb-slots">
              {!shown.length ? <p className="qb-alt" style={{ margin: 0 }}>このメニューは、いま予約できる空きがありません。</p> : null}
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
                <button type="button" className="qb-more" onClick={() => { setAll(true); load(true, info && info.service) }}>ほかの日時を見る</button>
              ) : null}
            </div>
            {error ? <p className="qb-error" role="alert">{error}</p> : null}
            {picked ? (
              <form className="qb-form" onSubmit={submit} noValidate>
                <p className="qb-picked">{picked.day} {picked.time}（{picked.minutes || copy.minutes}分）で予約します</p>
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
