export default function Logo({ size = 32, id = 'logoGrad' }) {
  return (
    <div className="logo-icon">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="14" stroke={`url(#${id})`} strokeWidth="2.5" />
        <circle cx="16" cy="16" r="6" fill={`url(#${id})`} />
        <line x1="16" y1="2" x2="16" y2="10" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="22" x2="16" y2="30" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" />
        <line x1="2" y1="16" x2="10" y2="16" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" />
        <line x1="22" y1="16" x2="30" y2="16" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" />
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="32" y2="32">
            <stop stopColor="#6366f1" />
            <stop offset="1" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}
