import { useEffect, useState } from 'react'
import { funnel } from '../lib/analytics'

// フォームを送った直後に出る日程ピッカー。
//
// 狙いは一つだけです。送信から折り返しまでの空白を無くすこと。48時間以内に
// 返信します、と書いてある側で相手を48時間待たせると、その間に相手は他社の
// フォームも送ります。候補を出して1クリックで確定できれば、その場で商談が
// 決まる。夜でも休日でもサーバーは動いているので、人の待ち時間は0になります。
//
// 表示しない条件をはっきりさせてあること: 予約の仕組みが動いていないとき
// （Google未接続かつ保存先も無いとき）は、この欄は出ません。送信後の画面が
// 今までと同じに見えるのが正しい振る舞いで、「日程を選べます」と出しておいて
// 押したら失敗する、が一番悪い。

export default function BookingPicker({ contact }) {
  const [state, setState] = useState('loading') // loading | open | done | off
  const [slots, setSlots] = useState([])
  const [total, setTotal] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [busyKey, setBusyKey] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const load = async (all = false) => {
    try {
      const res = await fetch('/api/booking' + (all ? '?all=1' : ''))
      const data = await res.json()
      if (!data.ok || !data.enabled || !data.slots.length) { setState('off'); return }
      setSlots(data.slots)
      setTotal(data.total || data.slots.length)
      setState('open')
      if (!all) funnel.bookingView()
    } catch (_) {
      setState('off')
    }
  }

  useEffect(() => { load(false) }, [])

  const choose = async (slot) => {
    setBusyKey(slot.key)
    setError('')
    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: slot.key,
          name: contact.name,
          email: contact.email,
          message: contact.message,
          // フォームで選んだ内容を、そのまま予定に持っていく。
          company: contact.company || '',
          topics: contact.topics || [],
          // 見えない欄（bot よけ）。人の手では空のままです。
          website: '',
          page: typeof window !== 'undefined' ? window.location.hash || window.location.pathname : '',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        // 先に取られた。押した人に選び直してもらうには、新しい一覧が要る。
        setError(data.message || 'その枠は埋まりました。別の日時をお選びください。')
        await load(expanded)
        return
      }
      if (!res.ok || !data.ok) throw new Error(data.message || `status ${res.status}`)
      funnel.bookingConfirm()
      setResult(data)
      setState('done')
    } catch (e) {
      setError('予約できませんでした。お手数ですが、メールでのご返信をお待ちください。')
    } finally {
      setBusyKey('')
    }
  }

  if (state === 'loading' || state === 'off') return null

  if (state === 'done') {
    return (
      <div className="booking booking--done" role="status">
        <p className="booking-title">✓ 商談のお時間が確定しました</p>
        <p className="booking-when">{result.when}<span>（日本時間）</span></p>
        {result.meet ? (
          <p className="booking-meet">
            <a href={result.meet} target="_blank" rel="noopener noreferrer">{result.meet}</a>
          </p>
        ) : null}
        <p className="booking-note">
          {result.invited
            ? 'カレンダーへの登録と招待メールの送信まで完了しています。当日はこのURLからご参加ください。'
            : 'お席を確保しました。接続用のURLを添えて、確定のご連絡を差し上げます。'}
        </p>
      </div>
    )
  }

  return (
    <div className="booking">
      <p className="booking-title">このまま商談のお時間も決められます</p>
      <p className="booking-lead">
        ご都合のよい枠を選ぶと、その場で確定します。オンライン（Google Meet）で30〜60分、費用はかかりません。
      </p>
      {error ? <p className="booking-error" role="alert">{error}</p> : null}
      <div className="booking-slots">
        {slots.map((s) => (
          <button
            key={s.key}
            type="button"
            className="booking-slot"
            disabled={!!busyKey}
            aria-busy={busyKey === s.key}
            onClick={() => choose(s)}
          >
            <span className="booking-day">{s.day}</span>
            <span className="booking-time">{s.time}</span>
            {busyKey === s.key ? <span className="booking-slot-state">予約中…</span> : null}
          </button>
        ))}
      </div>
      {!expanded && total > slots.length ? (
        <button
          type="button"
          className="booking-more"
          onClick={() => { setExpanded(true); load(true) }}
        >
          全ての候補日程を見る（残り {total - slots.length} 件）
        </button>
      ) : null}
      <p className="booking-skip">
        日程は後日でも構いません。その場合もこちらから48時間以内にご返信します。<br />
        枠を選ぶと、招待の送付のためにお名前とメールアドレスがGoogleカレンダーの予定に使われます。
      </p>
    </div>
  )
}
