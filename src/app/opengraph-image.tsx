import { ImageResponse } from 'next/og'

// Dynamisches OG-Image für Hauptseite + alle Sub-Pages ohne eigenes
// opengraph-image.tsx. Wird beim Share auf WhatsApp/Twitter/LinkedIn
// als Vorschau angezeigt. 1200×630 ist der Standard.

export const alt = 'Claimondo — Ihr Kfz-Schaden, digital geregelt'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0D1B3E 0%, #1E3A5F 60%, #4573A2 100%)',
          padding: '80px',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Watermark-Schild rechts */}
        <div
          style={{
            position: 'absolute',
            right: -60,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 540,
            height: 540,
            background: 'rgba(123, 163, 204, 0.08)',
            borderRadius: '50%',
            display: 'flex',
          }}
        />

        {/* Live-Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '10px 20px',
            borderRadius: 999,
            marginBottom: 40,
          }}
        >
          <div style={{ width: 10, height: 10, background: '#4ade80', borderRadius: 999 }} />
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 24 }}>
            Live · Antwort unter 15 Min
          </span>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontSize: 86,
              fontWeight: 800,
              color: '#FFFFFF',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            Unfall gehabt?
          </span>
          <span
            style={{
              fontSize: 86,
              fontWeight: 800,
              color: '#F5F1E8',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              marginTop: 6,
            }}
          >
            Wir regeln das.
          </span>
        </div>

        {/* Subline */}
        <div
          style={{
            display: 'flex',
            marginTop: 36,
            fontSize: 32,
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.3,
          }}
        >
          Gutachten · Anwalt · Werkstatt · Auszahlung — 0 € für unverschuldet Geschädigte
        </div>

        {/* Brand-Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 80,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <span style={{ fontSize: 38, fontWeight: 700, color: '#FFFFFF' }}>
            claim
          </span>
          <span style={{ fontSize: 38, fontWeight: 700, color: '#7BA3CC', marginLeft: -10 }}>
            ondo
          </span>
          <span
            style={{
              marginLeft: 24,
              padding: '4px 14px',
              fontSize: 20,
              color: '#7BA3CC',
              border: '1px solid rgba(123,163,204,0.4)',
              borderRadius: 999,
            }}
          >
            claimondo.de
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
