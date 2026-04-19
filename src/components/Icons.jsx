// Unified line-style icons with brand-only gradient (indigo → blue → cyan)
// Stroke 1.75px, minimalist, consistent visual weight

const brandGrad = (id) => (
  <linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
    <stop offset="0" stopColor="#4f46e5" />
    <stop offset="0.55" stopColor="#3b82f6" />
    <stop offset="1" stopColor="#06b6d4" />
  </linearGradient>
)

const ICON_STROKE = 1.75
const ICON_SIZE = 40

// Service icons — 48x48 viewBox, 40px render size
export const IconVideo = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 48 48" fill="none">
    <defs>{brandGrad('grad-video')}</defs>
    <rect x="5" y="13" width="28" height="22" rx="3.5" stroke="url(#grad-video)" strokeWidth={ICON_STROKE}/>
    <path d="M33 20L42 15V33L33 28" stroke="url(#grad-video)" strokeWidth={ICON_STROKE} strokeLinejoin="round"/>
    <path d="M17 20L23 24L17 28V20Z" stroke="url(#grad-video)" strokeWidth={ICON_STROKE} strokeLinejoin="round"/>
  </svg>
)

export const IconAI = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 48 48" fill="none">
    <defs>{brandGrad('grad-ai')}</defs>
    <rect x="10" y="10" width="28" height="28" rx="4" stroke="url(#grad-ai)" strokeWidth={ICON_STROKE}/>
    <rect x="16" y="16" width="16" height="16" rx="2" stroke="url(#grad-ai)" strokeWidth={ICON_STROKE}/>
    <path d="M10 18H6M10 24H6M10 30H6M38 18H42M38 24H42M38 30H42M18 10V6M24 10V6M30 10V6M18 38V42M24 38V42M30 38V42" stroke="url(#grad-ai)" strokeWidth={ICON_STROKE} strokeLinecap="round"/>
  </svg>
)

export const IconSNS = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 48 48" fill="none">
    <defs>{brandGrad('grad-sns')}</defs>
    <circle cx="12" cy="14" r="4" stroke="url(#grad-sns)" strokeWidth={ICON_STROKE}/>
    <circle cx="36" cy="14" r="4" stroke="url(#grad-sns)" strokeWidth={ICON_STROKE}/>
    <circle cx="24" cy="34" r="4" stroke="url(#grad-sns)" strokeWidth={ICON_STROKE}/>
    <path d="M15 16L21 31M33 16L27 31" stroke="url(#grad-sns)" strokeWidth={ICON_STROKE} strokeLinecap="round"/>
    <path d="M16 14H32" stroke="url(#grad-sns)" strokeWidth={ICON_STROKE} strokeLinecap="round"/>
  </svg>
)

export const IconWeb = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 48 48" fill="none">
    <defs>{brandGrad('grad-web')}</defs>
    <rect x="5" y="8" width="38" height="26" rx="3" stroke="url(#grad-web)" strokeWidth={ICON_STROKE}/>
    <path d="M5 15H43" stroke="url(#grad-web)" strokeWidth={ICON_STROKE}/>
    <circle cx="10" cy="11.5" r="1" fill="url(#grad-web)"/>
    <circle cx="14" cy="11.5" r="1" fill="url(#grad-web)"/>
    <circle cx="18" cy="11.5" r="1" fill="url(#grad-web)"/>
    <path d="M14 40H34M20 34V40M28 34V40" stroke="url(#grad-web)" strokeWidth={ICON_STROKE} strokeLinecap="round"/>
  </svg>
)

export const IconCast = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 48 48" fill="none">
    <defs>{brandGrad('grad-cast')}</defs>
    <circle cx="18" cy="15" r="5.5" stroke="url(#grad-cast)" strokeWidth={ICON_STROKE}/>
    <path d="M6 40C6 32 11 26 18 26C25 26 30 32 30 40" stroke="url(#grad-cast)" strokeWidth={ICON_STROKE} strokeLinecap="round"/>
    <circle cx="34" cy="17" r="4" stroke="url(#grad-cast)" strokeWidth={ICON_STROKE}/>
    <path d="M28 40C28 34 32 29 36 29C40 29 42 33 42 40" stroke="url(#grad-cast)" strokeWidth={ICON_STROKE} strokeLinecap="round"/>
  </svg>
)

export const IconCreative = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 48 48" fill="none">
    <defs>{brandGrad('grad-creative')}</defs>
    <path d="M24 5L28 17L40 17L30 24.5L34 36.5L24 29L14 36.5L18 24.5L8 17L20 17L24 5Z" stroke="url(#grad-creative)" strokeWidth={ICON_STROKE} strokeLinejoin="round"/>
    <circle cx="24" cy="22" r="3" stroke="url(#grad-creative)" strokeWidth={ICON_STROKE}/>
  </svg>
)

// Why/Pain section icons — 28px rendered, 40x40 viewBox
const PAIN_STROKE = 1.8
const PAIN_SIZE = 30

export const IconSNSPain = () => (
  <svg width={PAIN_SIZE} height={PAIN_SIZE} viewBox="0 0 40 40" fill="none">
    <defs>{brandGrad('grad-snsp')}</defs>
    <rect x="11" y="4" width="18" height="32" rx="3" stroke="url(#grad-snsp)" strokeWidth={PAIN_STROKE}/>
    <path d="M14 16L18 20L23 15L27 19" stroke="url(#grad-snsp)" strokeWidth={PAIN_STROKE} strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M24 15H27V18" stroke="url(#grad-snsp)" strokeWidth={PAIN_STROKE} strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="20" cy="32" r="1.5" stroke="url(#grad-snsp)" strokeWidth={PAIN_STROKE}/>
  </svg>
)

export const IconVideoPain = () => (
  <svg width={PAIN_SIZE} height={PAIN_SIZE} viewBox="0 0 40 40" fill="none">
    <defs>{brandGrad('grad-vp')}</defs>
    <circle cx="20" cy="20" r="13" stroke="url(#grad-vp)" strokeWidth={PAIN_STROKE}/>
    <path d="M20 12V20L26 23" stroke="url(#grad-vp)" strokeWidth={PAIN_STROKE} strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const IconLINEPain = () => (
  <svg width={PAIN_SIZE} height={PAIN_SIZE} viewBox="0 0 40 40" fill="none">
    <defs>{brandGrad('grad-lp')}</defs>
    <path d="M8 7H32C34 7 35.5 8.5 35.5 10.5V23.5C35.5 25.5 34 27 32 27H16L8 33V10.5C8 8.5 9.5 7 11.5 7Z" stroke="url(#grad-lp)" strokeWidth={PAIN_STROKE} strokeLinejoin="round"/>
    <circle cx="15" cy="17" r="1.2" fill="url(#grad-lp)"/>
    <circle cx="21" cy="17" r="1.2" fill="url(#grad-lp)"/>
    <circle cx="27" cy="17" r="1.2" fill="url(#grad-lp)"/>
  </svg>
)
