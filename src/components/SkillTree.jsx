import { useState, useId } from 'react'
import { IconVideo, IconAI, IconSNS, IconWeb, IconCast, IconCreative } from './Icons'
import { events } from '../lib/analytics'

// Radial navigation in the shape of a skill tree: the six services on an
// inner ring, the pages someone weighs a decision with on an outer ring, all
// wired back to a single core. It replaces the search box — the site has
// twelve destinations, which is few enough to show rather than ask for.
//
// Angles run clockwise from the top. Positions are percentages of the box so
// the whole tree scales with one custom property.

const R1 = 23    // inner ring radius, % of the box
const R2 = 38.5  // outer ring radius — the gap has to clear an inner label

const NODES = [
  // Inner ring — 事業内容. These open that service's detail panel.
  { a: 0, ring: 1, short: '動画', full: '動画制作・映像編集', service: 'video', Icon: IconVideo },
  { a: 60, ring: 1, short: 'AI', full: 'AI導入・生成AI研修', service: 'ai', Icon: IconAI },
  { a: 120, ring: 1, short: 'Web', full: 'Web制作・アプリ開発', service: 'web', Icon: IconWeb },
  { a: 180, ring: 1, short: '制作', full: 'クリエイティブ制作', service: 'creative', Icon: IconCreative },
  { a: 240, ring: 1, short: 'キャスト', full: 'キャスト手配・イベント', service: 'cast', Icon: IconCast },
  { a: 300, ring: 1, short: 'SNS', full: 'SNS運用・LINE構築', service: 'sns', Icon: IconSNS },
  // Outer ring — 検討するための情報.
  { a: 30, ring: 2, short: '料金', full: '料金・お見積り', hash: '#/info/pricing' },
  { a: 90, ring: 2, short: '実績', full: '実績・制作事例', hash: '#/info/results' },
  { a: 150, ring: 2, short: '流れ', full: 'ご依頼の流れ', hash: '#/info/flow' },
  { a: 210, ring: 2, short: 'FAQ', full: 'よくある質問', hash: '#/info/faq' },
  { a: 270, ring: 2, short: 'お客様の声', full: 'お客様の声', hash: '#/info/testimonials' },
  { a: 330, ring: 2, short: '相談', full: 'お問い合わせ', hash: '#/info/contact-form' },
]

const pos = (a, r) => ({
  x: 50 + r * Math.sin((a * Math.PI) / 180),
  y: 50 - r * Math.cos((a * Math.PI) / 180),
})

export default function SkillTree() {
  const [active, setActive] = useState(null)
  const gid = useId().replace(/:/g, '')

  const go = (node) => {
    events.ctaClick('home-tree', node.full)
    if (node.service) {
      try { sessionStorage.setItem('lum_open_service', node.service) } catch (_) {}
      if (window.location.hash === '#/info/services') {
        window.dispatchEvent(new CustomEvent('lumenium:open-service', { detail: node.service }))
      } else {
        window.location.hash = '#/info/services'
      }
      return
    }
    window.location.hash = node.hash
  }

  return (
    <nav className="tree" aria-label="サービスとページの一覧">
      <div className="tree-box">
        <svg className="tree-wires" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id={`tg-${gid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#c7d2fe" stopOpacity=".85" />
              <stop offset="55%" stopColor="#818cf8" stopOpacity=".45" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity=".12" />
            </radialGradient>
          </defs>
          <circle className="tree-orbit" cx="50" cy="50" r={R1} />
          <circle className="tree-orbit" cx="50" cy="50" r={R2} />
          {NODES.map((n) => {
            const p = pos(n.a, n.ring === 1 ? R1 : R2)
            return (
              <line
                key={n.full}
                className={`tree-wire ${active === n.full ? 'is-active' : ''}`}
                x1="50" y1="50" x2={p.x} y2={p.y}
                stroke={`url(#tg-${gid})`}
              />
            )
          })}
        </svg>

        <span className="tree-core" aria-hidden="true">
          <img src="/favicon.svg?v=3" alt="" width="64" height="64" />
        </span>

        {NODES.map((n) => {
          const p = pos(n.a, n.ring === 1 ? R1 : R2)
          return (
            <a
              key={n.full}
              // Real anchors, not buttons: every node has a destination, so
              // middle-click, open-in-new-tab and the status bar all work, and
              // the markup says where each spoke goes.
              href={n.service ? '#/info/services' : n.hash}
              className={`tree-node tree-node--r${n.ring} ${active === n.full ? 'is-active' : ''}`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              onClick={(e) => {
                // Let a modified click fall through to the browser.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
                e.preventDefault()
                go(n)
              }}
              onMouseEnter={() => setActive(n.full)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(n.full)}
              onBlur={() => setActive(null)}
              aria-label={n.full}
            >
              <span className="tree-node-dot">
                {n.Icon ? <n.Icon /> : <span className="tree-node-pip" aria-hidden="true" />}
              </span>
              <span className="tree-node-label">{n.short}</span>
            </a>
          )
        })}
      </div>

      {/* One readout rather than twelve tooltips: it never covers a node and
          it gives the outer ring's abbreviated labels somewhere to expand. */}
      <p className="tree-readout" aria-live="polite">
        {active || 'ご覧になりたい領域を選んでください'}
      </p>
    </nav>
  )
}
