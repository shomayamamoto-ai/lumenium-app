import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

// Query params (optional):
//   ?title=...  — overrides main headline
//   ?subtitle=... — overrides subtitle
export function GET(req) {
  try {
    return render(req)
  } catch (err) {
    console.error('[api/og] render failed:', err)
    return new Response('OG image render failed', { status: 500 })
  }
}

function render(req) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') || 'Lumenium'
  const subtitle =
    searchParams.get('subtitle') || '目的に、光を当てる。'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#0a0c1f',
          fontFamily: 'sans-serif',
          overflow: 'hidden',
        }}
      >
        {/* Aurora layer 1 */}
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            left: '-10%',
            width: '70%',
            height: '90%',
            background:
              'radial-gradient(ellipse at center, rgba(79,70,229,0.55), transparent 60%)',
            filter: 'blur(80px)',
            display: 'flex',
          }}
        />
        {/* Aurora layer 2 */}
        <div
          style={{
            position: 'absolute',
            bottom: '-20%',
            right: '-10%',
            width: '70%',
            height: '90%',
            background:
              'radial-gradient(ellipse at center, rgba(6,182,212,0.45), transparent 60%)',
            filter: 'blur(90px)',
            display: 'flex',
          }}
        />
        {/* Aurora layer 3 */}
        <div
          style={{
            position: 'absolute',
            top: '20%',
            right: '10%',
            width: '50%',
            height: '60%',
            background:
              'radial-gradient(ellipse at center, rgba(168,85,247,0.35), transparent 60%)',
            filter: 'blur(60px)',
            display: 'flex',
          }}
        />
        {/* Dot grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            opacity: 0.6,
            display: 'flex',
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '72px 80px',
            justifyContent: 'space-between',
          }}
        >
          {/* Top: label */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              color: 'rgba(165,180,252,0.9)',
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 6,
              textTransform: 'uppercase',
            }}
          >
            <div
              style={{
                width: 32,
                height: 1.5,
                background:
                  'linear-gradient(90deg, transparent, rgba(165,180,252,0.9))',
                display: 'flex',
              }}
            />
            <span>Lumenium · Studio</span>
          </div>

          {/* Middle: title + subtitle */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            <div
              style={{
                fontSize: 88,
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.08,
                letterSpacing: -2.5,
                maxWidth: 920,
                textShadow: '0 4px 32px rgba(79,70,229,0.4)',
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: 30,
                color: 'rgba(255,255,255,0.72)',
                letterSpacing: 0.2,
                maxWidth: 900,
                lineHeight: 1.45,
              }}
            >
              {subtitle}
            </div>
          </div>

          {/* Bottom: divider + tags + url */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
            }}
          >
            <div
              style={{
                width: 120,
                height: 2,
                background:
                  'linear-gradient(90deg, #6366f1 0%, #3b82f6 50%, #06b6d4 100%)',
                borderRadius: 2,
                display: 'flex',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  color: 'rgba(255,255,255,0.7)',
                  letterSpacing: 0.6,
                }}
              >
                動画制作 · DX支援 · AI導入 · SNS運用 · Web制作
              </div>
              <div
                style={{
                  fontSize: 20,
                  color: 'rgba(165,180,252,0.85)',
                  fontWeight: 600,
                  letterSpacing: 1,
                }}
              >
                lumenium.net
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    }
  )
}
