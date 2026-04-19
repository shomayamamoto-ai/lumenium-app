import { useState, useMemo } from 'react'
import { events } from '../lib/analytics'

const FAQ_GROUPS = [
  {
    label: 'ご相談・お見積り',
    items: [
      {
        q: 'どんな相談でも対応してもらえますか?',
        a: 'はい、抽象的な内容でもお気軽にご相談ください。「何をしたいかはっきりしないけど困っている」という段階からでも大丈夫です。お話を伺いながら最適なプランをご提案します。',
      },
      {
        q: '料金はいくらくらいですか?',
        a: '内容や規模によって異なりますが、動画は3万円〜、Web制作は30万円〜、クリエイティブは3万円〜が目安です。お見積りは無料ですので、まずはお気軽にお問い合わせください。ご予算に合わせたプランもご提案可能です。',
      },
      {
        q: '見積りだけでも依頼できますか?',
        a: 'もちろん可能です。他社と比較検討されている場合や、社内稟議用に概算が必要な場合もお気軽にご相談ください。見積り段階での強引な営業は一切いたしません。',
      },
      {
        q: '返信はどのくらいで来ますか?',
        a: 'お問い合わせから48時間以内にご返信いたします。急ぎの案件の場合はその旨をお知らせいただければ、優先的に対応します。',
      },
    ],
  },
  {
    label: 'プロジェクト進行',
    items: [
      {
        q: '納期はどのくらいですか?',
        a: '案件の規模により異なります。動画制作は2週間〜、Web制作は1〜2ヶ月、AI研修は1〜2週間が標準です。急ぎの場合もスケジュールを調整してご提案しますので、まずはご相談ください。',
      },
      {
        q: '修正は何回まで対応してもらえますか?',
        a: '修正回数は案件ごとにご相談の上で決定します。通常2〜3回の修正までは見積りに含まれています。大幅な方針変更の場合は別途ご相談となりますが、お客様にご満足いただけるまで丁寧に対応します。',
      },
      {
        q: '進行中のコミュニケーション方法は?',
        a: 'Slack / Chatwork / メール / Google Meet など、お客様が使い慣れたツールに合わせます。週1の進捗共有+必要に応じてレビュー会を行い、認識ズレが起きないよう進めます。',
      },
      {
        q: '途中でキャンセルや変更は可能ですか?',
        a: 'フェーズに応じてご相談可能です。着手前であれば無償でキャンセルできます。制作開始後は進行状況に応じた費用をご相談させていただきます。詳細は契約時に明記します。',
      },
    ],
  },
  {
    label: '対応範囲・実績',
    items: [
      {
        q: '遠方でも依頼できますか?',
        a: 'はい、オンラインでのやり取りが可能です。打ち合わせはZoomやGoogle Meet等で対応します。全国どこからでもご依頼いただけます。撮影など現地対応が必要な案件は別途ご相談ください。',
      },
      {
        q: '個人でも依頼できますか?',
        a: 'もちろんです。個人の方、個人事業主の方からのご依頼も歓迎しています。規模の大小を問わず、同じ姿勢でご提案します。初めてのご依頼でも安心してご相談ください。',
      },
      {
        q: '業界に合う実績はありますか?',
        a: '飲食店・IT企業・美容サロン・教育・広告代理店・士業など、12以上の業界で実績があります。初めての業界でもリサーチから入るため、同業種の実績がなくても支援可能です。',
      },
    ],
  },
]

const ALL_ITEMS = FAQ_GROUPS.flatMap((g) => g.items)

export default function FAQ() {
  const [openKey, setOpenKey] = useState(null)
  const [search, setSearch] = useState('')

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return FAQ_GROUPS
    return FAQ_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((it) => (it.q + it.a).toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0)
  }, [search])

  const totalVisible = filteredGroups.reduce((n, g) => n + g.items.length, 0)

  const toggle = (key, q) => {
    if (openKey !== key) events.faqOpen(q)
    setOpenKey(openKey === key ? null : key)
  }

  const onKeyNav = (e) => {
    const btns = Array.from(document.querySelectorAll('.faq-question'))
    const i = btns.indexOf(document.activeElement)
    let next = i
    if (e.key === 'ArrowDown') { e.preventDefault(); next = (i + 1) % btns.length }
    else if (e.key === 'ArrowUp') { e.preventDefault(); next = (i - 1 + btns.length) % btns.length }
    else if (e.key === 'Home') { e.preventDefault(); next = 0 }
    else if (e.key === 'End') { e.preventDefault(); next = btns.length - 1 }
    else return
    btns[next]?.focus()
  }

  return (
    <section className="section" id="faq">
      <div className="container">
        <div className="section-header" data-animate>
          <p className="section-label">FAQ</p>
          <h2 className="section-title">よくある質問</h2>
          <p className="section-desc">問い合わせ前の疑問を、先に解消できるようにまとめました。</p>
        </div>

        <div className="faq-wrapper" data-animate data-delay="1">
          <div className="faq-search" role="search">
            <svg className="faq-search-icon" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M17 17L13.5 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="質問を検索..."
              aria-label="よくある質問を検索"
            />
            {search && (
              <button type="button" className="faq-search-clear" onClick={() => setSearch('')} aria-label="検索をクリア">✕</button>
            )}
          </div>

          {totalVisible === 0 ? (
            <div className="faq-empty">
              <p>該当する質問が見つかりませんでした。</p>
              <a href="#contact-form" className="btn btn-accent" data-cta="faq-no-match">直接お問い合わせ</a>
            </div>
          ) : (
            <div className="faq-groups" onKeyDown={onKeyNav}>
              {filteredGroups.map((group) => (
                <div key={group.label} className="faq-group">
                  <h3 className="faq-group-title">{group.label}</h3>
                  <div className="faq-list">
                    {group.items.map((faq) => {
                      const key = `${group.label}-${faq.q}`
                      const isOpen = openKey === key
                      const panelId = `faq-panel-${key.replace(/\s+/g, '-')}`
                      const btnId = `faq-btn-${key.replace(/\s+/g, '-')}`
                      return (
                        <div key={key} className={`faq-item ${isOpen ? 'faq-item--open' : ''}`}>
                          <button
                            id={btnId}
                            className="faq-question"
                            onClick={() => toggle(key, faq.q)}
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            type="button"
                          >
                            <span>{faq.q}</span>
                            <span className="faq-icon" aria-hidden="true">{isOpen ? '−' : '＋'}</span>
                          </button>
                          <div id={panelId} className="faq-answer" role="region" aria-labelledby={btnId}>
                            <p>{faq.a}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="faq-footer">
            <p>他にもご不明な点があれば、お気軽にご相談ください。</p>
            <a href="#contact-form" className="btn btn-ghost-w" data-cta="faq-contact">質問を送る</a>
          </div>
        </div>
      </div>
    </section>
  )
}
