import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { useState, useRef, useEffect } from 'react'
import { events, funnel } from '../lib/analytics'
import BookingPicker from './BookingPicker'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LIMITS = { name: 50, email: 100, message: 1000 }

function validate(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'お名前を入力してください'
  else if (form.name.length > LIMITS.name) errors.name = `${LIMITS.name}文字以内でお願いします`
  if (!form.email.trim()) errors.email = 'メールアドレスを入力してください'
  else if (!EMAIL_RE.test(form.email)) errors.email = 'メールアドレスの形式を確認してください'
  if (!form.message.trim()) errors.message = 'ご相談内容を入力してください'
  else if (form.message.trim().length < 10) errors.message = 'もう少し詳しくご記入ください (10文字以上)'
  else if (form.message.length > LIMITS.message) errors.message = `${LIMITS.message}文字以内でお願いします`
  return errors
}

export default function ContactForm() {
  // The simulator hands over the specification it just produced. Without this
  // the visitor arrives at a blank box having already answered the questions,
  // and the enquiry reaches us with no scale or budget to prioritise by.
  const [form, setForm] = useState(() => {
    let spec = ''
    try { spec = sessionStorage.getItem('lum_estimate') || '' } catch (_) {}
    return { name: '', email: '', message: spec ? spec + '\n\n---\n' : '', company: '' }
  })
  const [carried] = useState(() => {
    try { return !!sessionStorage.getItem('lum_estimate') } catch (_) { return false }
  })
  const [touched, setTouched] = useState({})
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null) // {type, text}
  // 送った内容は、フォームを空にする前に控えておく。日程を確定するときに
  // 名前とメールをもう一度打たせるようでは、その場で決める意味が無い。
  const [lastSent, setLastSent] = useState(null)
  const startedRef = useRef(false)

  useEffect(() => {
    funnel.contactView()
    // Consumed once: a later visit to the form should start clean rather than
    // repeating an estimate the visitor may have moved on from.
    try { sessionStorage.removeItem('lum_estimate') } catch (_) {}
  }, [])

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4500)
  }

  const handleStart = () => {
    if (startedRef.current) return
    startedRef.current = true
    events.formStart('contact')
    funnel.contactStart()
  }

  const onChange = (key) => (e) => {
    const next = { ...form, [key]: e.target.value }
    setForm(next)
    if (touched[key]) setErrors(validate(next))
  }

  const onBlur = (key) => () => {
    setTouched({ ...touched, [key]: true })
    setErrors(validate(form))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nextErrors = validate(form)
    setErrors(nextErrors)
    setTouched({ name: true, email: true, message: true })
    if (Object.keys(nextErrors).length > 0) {
      showToast('error', '入力内容をご確認ください')
      const firstErrKey = Object.keys(nextErrors)[0]
      const firstInput = document.getElementById(firstErrKey)
      if (firstInput && firstInput.scrollIntoView) firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setSending(true)
    events.formSubmit('contact')
    funnel.contactSubmit()

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          message: form.message,
          // Left empty by anyone who can see the form; bots fill every field.
          company: form.company,
          // Which page the enquiry came from, so it can be prioritised.
          page: typeof window !== 'undefined' ? window.location.hash || window.location.pathname : '',
        }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setSent(true)
      setLastSent({ name: form.name, email: form.email, message: form.message })
      showToast('success', 'お問い合わせを送信しました。48時間以内にご返信いたします。')
      setForm({ name: '', email: '', message: '', company: '' })
      setTouched({})
      setErrors({})
      setTimeout(() => setSent(false), 8000)
    } catch (err) {
      console.error('[contact] submit failed', err)
      showToast('error', '送信に失敗しました。お手数ですが shoma.yamamoto@lumenium.net まで直接ご連絡ください。')
    } finally {
      setSending(false)
    }
  }

  const fieldState = (key) => {
    if (errors[key] && touched[key]) return 'error'
    if (touched[key] && form[key] && !errors[key]) return 'valid'
    return ''
  }

  const charInfo = (key) => {
    const len = form[key].length
    const max = LIMITS[key]
    const nearLimit = len > max * 0.8
    return { len, max, nearLimit }
  }

  return (
    <section className="section section--gray" id="contact-form">
      <div className="container">
        <div className="section-header" data-animate>
          <p className="section-label">{SECTION.contact.label}</p>
          <h2 className="section-title">{rich(SECTION.contact.title)}</h2>
          <p className="section-desc">{rich(SECTION.contact.desc)}</p>
        </div>
        <form className="contact-form" onSubmit={handleSubmit} data-animate data-delay="1" noValidate>
          <div className="form-row">
            <div className={`form-group form-group--${fieldState('name')}`}>
              <label htmlFor="name">お名前 <span className="required" aria-hidden="true">*</span></label>
              <input
                id="name"
                type="text"
                required
                placeholder="山田 太郎"
                autoComplete="name"
                maxLength={LIMITS.name}
                aria-invalid={!!errors.name && touched.name}
                aria-describedby={errors.name && touched.name ? 'err-name' : undefined}
                value={form.name}
                onFocus={handleStart}
                onChange={onChange('name')}
                onBlur={onBlur('name')}
              />
              {errors.name && touched.name ? (
                <p id="err-name" className="form-error" role="alert">{errors.name}</p>
              ) : null}
            </div>
            <div className={`form-group form-group--${fieldState('email')}`}>
              <label htmlFor="email">メールアドレス <span className="required" aria-hidden="true">*</span></label>
              <input
                id="email"
                type="email"
                required
                inputMode="email"
                autoComplete="email"
                placeholder="example@email.com"
                maxLength={LIMITS.email}
                aria-invalid={!!errors.email && touched.email}
                aria-describedby={errors.email && touched.email ? 'err-email' : undefined}
                value={form.email}
                onFocus={handleStart}
                onChange={onChange('email')}
                onBlur={onBlur('email')}
              />
              {errors.email && touched.email ? (
                <p id="err-email" className="form-error" role="alert">{errors.email}</p>
              ) : null}
            </div>
          </div>
          <div className={`form-group form-group--${fieldState('message')}`}>
            <div className="form-label-row">
              <label htmlFor="message">ご相談内容 <span className="required" aria-hidden="true">*</span></label>
              <span
                className={`form-counter ${charInfo('message').nearLimit ? 'is-near-limit' : ''}`}
                aria-live="polite"
              >
                {charInfo('message').len} / {charInfo('message').max}
              </span>
            </div>
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
              <label htmlFor="company">会社名（入力しないでください）</label>
              <input
                id="company"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              />
            </div>
            {carried && (
              <p className="form-carried">
                見積りシミュレーターで選んだ内容を下に入れてあります。ご自由に書き換えてください。
              </p>
            )}
            <textarea
              id="message"
              required
              rows="6"
              placeholder="ご相談内容をご記入ください。抽象的な内容でも大丈夫です。"
              maxLength={LIMITS.message}
              aria-invalid={!!errors.message && touched.message}
              aria-describedby={errors.message && touched.message ? 'err-message' : undefined}
              value={form.message}
              onFocus={handleStart}
              onChange={onChange('message')}
              onBlur={onBlur('message')}
            />
            {errors.message && touched.message ? (
              <p id="err-message" className="form-error" role="alert">{errors.message}</p>
            ) : null}
          </div>
          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-accent btn-form"
              data-cta="contact-submit"
              disabled={sending}
              aria-busy={sending}
            >
              {sending ? (
                <span className="btn-loading">
                  <span className="btn-spinner" aria-hidden="true" />
                  送信中...
                </span>
              ) : sent ? '✓ 送信しました' : '送信する →'}
            </button>
            <p className="form-note">✓ 48時間以内に返信 ✓ 見積り無料 ✓ 秘密厳守</p>
          </div>
        </form>
        {/* 送信できたときだけ、その下に日程の候補が出る。予約の仕組みが
            動いていなければ、この欄は何も描きません。 */}
        {lastSent ? <BookingPicker contact={lastSent} /> : null}
        {toast && (
          <div
            className={`form-toast form-toast--${toast.type}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <span className="form-toast-icon" aria-hidden="true">
              {toast.type === 'success' ? '✓' : '!'}
            </span>
            <span>{toast.text}</span>
          </div>
        )}
      </div>
    </section>
  )
}
