import { useEffect, useRef, useState } from 'react'
import { funnel, whenSeen } from '../lib/analytics'
import { bookingCopy } from './bookingCopy'
import { textFor } from '../lib/experiments'
import SlotPicker from './SlotPicker'

/**
 * お問い合わせフォームの中の「日時を選ぶ」欄。
 *
 * 以前はフォームの上に、別の予約欄（空き日時 → お名前とメール → 予約）を
 * 置いていました。入口が2つあると、どちらに書けばよいか迷わせるので、
 * フォームを1つにまとめ、日時まで決められる人はこの欄で選んでから
 * 送信します（選ばなくても送れます）。予約そのものは送信のときに
 * ContactForm.jsx が行います。
 *
 * 空き（予定の前後をあけたもの）を、日にち → 時刻の順に選びます（SlotPicker.jsx）。
 * 受付時間が長いと1日に数十枠になるので、全部を1列に並べることはしません。
 * 長さ・呼び方・メニューは管理画面の「予約管理」で
 * 決めたもので、ここに「30分」のような数字は書きません（サーバーが返す
 * minutes を使います）。メニューが2つ以上あるときだけ、先にメニューを
 * 選んでもらいます。予約の仕組みが動いていないとき（枠が取れないとき）は、
 * 何も出しません。
 *
 * value: 選んだ枠（無ければ null） / onChange(枠|null) / onInfo(予約の設定)
 * reloadKey: 変わると空きを読み直します（選んだ枠が先に埋まったときなど）。
 */
export default function SlotField({ value, onChange, onInfo, reloadKey = 0 }) {
  const [state, setState] = useState('loading') // loading | open | off
  const [slots, setSlots] = useState([])
  const [info, setInfo] = useState(null)       // minutes / wording / services / service
  const boxRef = useRef(null)

  const load = async (service) => {
    try {
      // 日にちを選べるように、受け付けている期間の枠を全部もらいます。
      const q = new URLSearchParams({ all: '1' })
      if (service) q.set('service', service)
      const res = await fetch('/api/booking?' + q.toString())
      const data = await res.json()
      if (!data.ok || !data.enabled) { if (!service) setState('off'); return }
      // メニューを選び直して空きが無いときは、欄ごと消さずに「空きがありません」と出す。
      if (!data.slots.length && !service) { setState('off'); return }
      const next = { minutes: data.minutes, wording: data.wording, online: data.online, mode: data.mode, services: data.services || [], service: data.service }
      setInfo(next)
      if (onInfo) onInfo(next)
      setSlots(data.slots)
      setState('open')
    } catch (_) {
      if (!service) setState('off')
    }
  }
  const chooseService = (id) => {
    if (onChange) onChange(null)
    setInfo((x) => ({ ...x, service: id }))
    load(id)
  }
  useEffect(() => { load(info && info.service) }, [reloadKey])
  // 「日程候補を見た」は、候補が実際に画面に入ったときに1回だけ。
  useEffect(() => (state === 'open' ? whenSeen(boxRef.current, funnel.bookingView) : undefined), [state])

  if (state === 'loading' || state === 'off') return null
  const copy = bookingCopy(info)

  const pick = (s) => {
    funnel.contactStart()
    if (onChange) onChange(value && value.key === s.key ? null : { ...s, minutes: s.minutes || copy.minutes, service: info && info.service })
  }

  return (
    <div className="form-group qb-field" ref={boxRef}>
      <label id="qb-h">{textFor('booking.heading', copy.heading)}<span className="qb-opt">（選べる方だけ）</span></label>
      <p className="qb-lead">{copy.lead}日時を選ばずに、相談内容だけ送ることもできます。</p>
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
      {!slots.length ? <p className="qb-alt" style={{ margin: 0 }}>このメニューは、いま予約できる空きがありません。</p> : null}
      <SlotPicker slots={slots} value={value ? value.key : ''} onPick={pick} labelledBy="qb-h" />
      {value ? (
        <p className="qb-picked" role="status">
          ✓ {value.day} {value.time}（{value.minutes || copy.minutes}分・日本時間）で予約します。もう一度押すと取り消せます。
        </p>
      ) : null}
    </div>
  )
}
