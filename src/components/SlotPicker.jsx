import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * 予約の日時を選ぶ部品（日にちを選ぶ → 時刻を選ぶ）。
 *
 * 以前は「11/17(火) 10:00〜11:00」のボタンを全部並べていました。受付が長い店
 * （朝7時〜深夜2時・30分刻み）だと1日に37個、2週間で数百個になり、目当ての
 * 日時を探せません。日にちを横に並べて1つ選び、その日の時刻だけを
 * 「午前・午後・夜・深夜」に分けて出します。
 *
 * 日付は本当の日付です。火曜の深夜1時（＝水曜の 1:00）は、水曜の「深夜」に出ます。
 *
 * slots: サーバーの返す枠（{ key, day:'11/17(火)', time:'10:00〜11:00', … }）。時刻順。
 * value: 選んでいる枠の key（無ければ ''） / onPick(枠) / busyKey: 送信中の枠の key
 */

const PERIODS = [
  { id: 'late', label: '深夜', hint: '0時〜5時', from: 0, to: 5 },
  { id: 'am', label: '午前', hint: '', from: 5, to: 12 },
  { id: 'pm', label: '午後', hint: '', from: 12, to: 17 },
  { id: 'eve', label: '夜', hint: '17時〜', from: 17, to: 24 },
]

const hourOf = (s) => Number(String(s.time || '').slice(0, 2)) || 0
const startOf = (s) => String(s.time || '').split(/[〜~]/)[0]

/** 枠を日にちごと・時間帯ごとにまとめます（テストからも使います）。 */
export function groupSlots(slots) {
  const days = []
  for (const s of slots || []) {
    let d = days[days.length - 1]
    if (!d || d.day !== s.day) {
      const m = /^(\d+\/\d+)\((.)\)$/.exec(s.day || '') || [null, s.day || '', '']
      d = { day: s.day, md: m[1], wd: m[2], slots: [] }
      days.push(d)
    }
    d.slots.push(s)
  }
  for (const d of days) {
    d.periods = PERIODS
      .map((p) => ({ ...p, slots: d.slots.filter((s) => { const h = hourOf(s); return h >= p.from && h < p.to }) }))
      .filter((p) => p.slots.length)
  }
  return days
}

export default function SlotPicker({ slots, value = '', onPick, busyKey = '', disabled = false, labelledBy }) {
  const days = useMemo(() => groupSlots(slots), [slots])
  const [day, setDay] = useState('')
  const stripRef = useRef(null)

  // 選んでいる枠の日、無ければ最初の日。枠が読み直されて日が消えたら最初の日に戻す。
  useEffect(() => {
    const picked = value && (slots || []).find((s) => s.key === value)
    if (picked) { setDay(picked.day); return }
    if (!days.some((d) => d.day === day)) setDay(days.length ? days[0].day : '')
  }, [days, value])

  if (!days.length) return null
  const cur = days.find((d) => d.day === day) || days[0]
  const idx = days.indexOf(cur)
  const next = days[idx + 1]
  const nextLate = next && next.periods.find((p) => p.id === 'late')

  const choose = (d) => {
    setDay(d.day)
    // 端に隠れた日にちを押したとき、見える位置まで寄せます。
    const el = stripRef.current && stripRef.current.querySelector(`[data-day="${d.day}"]`)
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }

  return (
    <div className="sp" role="group" aria-labelledby={labelledBy}>
      <div className="sp-days" ref={stripRef} role="group" aria-label="日にち">
        {days.map((d) => (
          <button
            key={d.day}
            type="button"
            data-day={d.day}
            className={`sp-day ${d.day === cur.day ? 'is-on' : ''} ${d.wd === '土' ? 'is-sat' : d.wd === '日' ? 'is-sun' : ''}`}
            aria-pressed={d.day === cur.day}
            onClick={() => choose(d)}
          >
            <span className="sp-wd">{d.wd}</span>
            <span className="sp-md">{d.md}</span>
            <span className="sp-n">{d.slots.length}枠</span>
          </button>
        ))}
      </div>
      <div className="sp-times" aria-live="polite">
        {cur.periods.map((p) => (
          <div className="sp-period" key={p.id}>
            <p className="sp-ph">{p.label}{p.hint ? <span>{p.hint}</span> : null}</p>
            <div className="sp-grid" role="group" aria-label={`${cur.day} ${p.label}`}>
              {p.slots.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`sp-time ${value === s.key ? 'is-on' : ''}`}
                  aria-pressed={value === s.key}
                  aria-label={`${s.day} ${s.time}`}
                  disabled={disabled || (!!busyKey && busyKey !== s.key)}
                  aria-busy={busyKey === s.key}
                  onClick={() => onPick && onPick(s)}
                >
                  {startOf(s)}
                </button>
              ))}
            </div>
          </div>
        ))}
        {nextLate ? (
          <p className="sp-note">
            {cur.md}の深夜（24時以降）は、
            <button type="button" className="sp-link" onClick={() => choose(next)}>{next.day}の「深夜」</button>
            にあります。
          </p>
        ) : null}
      </div>
    </div>
  )
}
