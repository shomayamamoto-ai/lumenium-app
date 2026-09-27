import { useEffect, useState } from 'react'

/**
 * スマホの画面下に出る、相談の入口。
 *
 * 長いページを読み進めた人が「相談してみよう」と思ったとき、ボタンを
 * 探して上下に戻らなくて済むように。最初の画面（すでに相談ボタンが
 * 見えている）と、お問い合わせフォームが見えているあいだは隠します。
 * 出し入れは透明度だけで、画面の上を滑らせません。
 */
export default function MobileCTA() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let formVisible = false
    const update = () => {
      const past = window.scrollY > window.innerHeight * 0.8
      setShow(past && !formVisible)
    }
    let io = null
    const watch = () => {
      const form = document.getElementById('contact-form')
      if (!form || typeof IntersectionObserver !== 'function') return
      io = new IntersectionObserver((es) => {
        formVisible = es.some((e) => e.isIntersecting)
        update()
      })
      io.observe(form)
    }
    const t = setTimeout(watch, 800)
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      clearTimeout(t)
      window.removeEventListener('scroll', update)
      if (io) io.disconnect()
    }
  }, [])
  return (
    <div className={`mobile-cta ${show ? 'is-on' : ''}`} aria-hidden={!show}>
      <a href="#contact-form" className="btn btn-accent" data-cta="mobile-sticky" tabIndex={show ? 0 : -1}>無料で相談する</a>
      <span className="mobile-cta-note">48時間以内にご返信</span>
    </div>
  )
}
