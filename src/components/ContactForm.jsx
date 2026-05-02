import { useState, useRef } from 'react'
import { events } from '../lib/analytics'

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
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [touched, setTouched] = useState({})
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null) // {type, text}
  const startedRef = useRef(false)

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4500)
  }

  const handleStart = () => {
    if (startedRef.current) return
    startedRef.current = true
    events.formStart('contact')
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

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, message: form.message }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setSent(true)
      showToast('success', 'お問い合わせを送信しました。48時間以内にご返信いたします。')
      setForm({ name: '', email: '', message: '' })
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
          <p className="section-label">CONTACT</p>
          <h2 className="section-title">お問い合わせ</h2>
          <p className="section-desc">お気軽にご相談ください。</p>
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
