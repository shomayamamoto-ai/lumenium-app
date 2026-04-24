import { useEffect, useState } from 'react'

const SECTIONS = [
  { id: 'top', label: 'Top' },
  { id: 'pain', label: 'Why' },
  { id: 'story', label: 'Story' },
  { id: 'services', label: 'Services' },
  { id: 'results', label: 'Results' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'testimonials', label: 'Voices' },
  { id: 'flow', label: 'Flow' },
  { id: 'blog', label: 'Blog' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contact-form', label: 'Contact' },
]

export default function DotNav() {
  const [active, setActive] = useState('top')

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY + 200
      let current = SECTIONS[0].id
      for (const { id } of SECTIONS) {
        const el = document.getElementById(id)
        if (el && el.offsetTop <= y) current = id
      }
      setActive(current)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className="dotnav" aria-label="セクション一覧">
      {SECTIONS.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          className={`dotnav__link${active === id ? ' is-active' : ''}`}
          data-label={label}
          aria-label={`${label} へ移動`}
        >
          <span aria-hidden="true" />
        </a>
      ))}
    </nav>
  )
}
