import { SECTION } from '../data/text'
import { rich } from '../lib/rich'
import { useState, useMemo } from 'react'
import { events } from '../lib/analytics'

import { FAQ_GROUPS } from '../data/faq'

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
          <p className="section-label">{SECTION.faq.label}</p>
          <h2 className="section-title">{rich(SECTION.faq.title)}</h2>
          <p className="section-desc">{rich(SECTION.faq.desc)}</p>
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
