import { useEffect, useRef } from 'react'
import { useFocusTrap } from '../lib/focusTrap'

export default function Privacy({ onClose }) {
  const modalRef = useRef(null)
  useFocusTrap(modalRef, true)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="privacy-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="privacy-title">
      <div className="privacy-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="privacy-header">
          <h2 id="privacy-title">プライバシーポリシー</h2>
          <button className="privacy-close" onClick={onClose} aria-label="プライバシーポリシーを閉じる" type="button">✕</button>
        </div>
        <div className="privacy-body">
          <h3>1. 個人情報の取得</h3>
          <p>当サイトでは、お問い合わせフォームを通じてお名前、メールアドレス等の個人情報を取得することがあります。</p>

          <h3>2. 個人情報の利用目的</h3>
          <p>取得した個人情報は、以下の目的でのみ利用いたします。</p>
          <ul>
            <li>お問い合わせへの回答</li>
            <li>サービスに関するご案内</li>
            <li>ご依頼いただいた業務の遂行</li>
          </ul>

          <h3>3. 個人情報の第三者提供</h3>
          <p>法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供することはありません。</p>

          <h3>4. 個人情報の管理</h3>
          <p>個人情報の漏洩、滅失、毀損を防ぐため、適切な安全対策を講じます。</p>

          <h3>5. アクセス解析ツール</h3>
          <p>当サイトでは、Googleアナリティクスを利用してアクセス情報を収集する場合があります。データは匿名で収集されており、個人を特定するものではありません。</p>

          <h3>6. お問い合わせ</h3>
          <p>個人情報に関するお問い合わせは、サイト内のお問い合わせフォームよりご連絡ください。</p>

          <p className="privacy-date">制定日：2026年4月4日<br />Lumenium</p>
        </div>
      </div>
    </div>
  )
}
