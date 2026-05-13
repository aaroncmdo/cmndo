// Token-Audit-Skip: next/og inline-only API — kein Tailwind/CSS-Var-Support.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Als Kfz-Sachverständiger Claimondo-Partner werden — Warteliste eintragen'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Visuelles Motiv: Netzwerk-Karte — Deutschland mit Verbindungslinien,
// Einzugsgebiets-Kreise, Auftrags-Pings. Signalisiert Partnerschaft + Reichweite.
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          background: '#0D1B3E',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Hintergrund-Raster */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(69,115,162,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(69,115,162,0.07) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            display: 'flex',
          }}
        />

        {/* Leuchtender Akzent-Gradient oben links */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            left: -80,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(69,115,162,0.12) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Einzugsgebiet-Kreis rechts */}
        <div
          style={{
            position: 'absolute',
            right: 60,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 460,
            height: 460,
          }}
        >
          {[440, 340, 250, 170, 100].map((d, i) => (
            <div
              key={d}
              style={{
                position: 'absolute',
                width: d,
                height: d,
                borderRadius: '50%',
                border: `1px solid rgba(69,115,162,${0.08 + i * 0.07})`,
                display: 'flex',
              }}
            />
          ))}
          {/* Mittelpunkt = SV-Standort */}
          <div
            style={{
              position: 'absolute',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#4573A2',
              boxShadow: '0 0 0 6px rgba(69,115,162,0.2), 0 0 0 12px rgba(69,115,162,0.08)',
              display: 'flex',
            }}
          />
          {/* Auftrags-Pins im Einzugsgebiet */}
          {[
            { top: 110, left: 130, size: 9, opacity: 0.9 },
            { top: 280, left: 100, size: 7, opacity: 0.7 },
            { top: 160, right: 110, size: 8, opacity: 0.8 },
            { bottom: 130, right: 140, size: 6, opacity: 0.6 },
            { bottom: 160, left: 160, size: 7, opacity: 0.5 },
          ].map((p, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: p.top,
                left: p.left,
                right: (p as { right?: number }).right,
                bottom: (p as { bottom?: number }).bottom,
                width: p.size,
                height: p.size,
                borderRadius: '50%',
                background: '#7BA3CC',
                opacity: p.opacity,
                display: 'flex',
              }}
            />
          ))}
          {/* Radius-Label */}
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(13,27,62,0.8)',
              border: '1px solid rgba(69,115,162,0.4)',
              borderRadius: 6,
              padding: '3px 10px',
              display: 'flex',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: '#7BA3CC', fontFamily: 'system-ui', letterSpacing: 0.5 }}>
              30 km
            </span>
          </div>
        </div>

        {/* Linke Akzentlinie */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 3,
            height: 630,
            background: 'linear-gradient(to bottom, transparent, #4573A2, transparent)',
            display: 'flex',
          }}
        />

        {/* Hauptinhalt */}
        <div
          style={{
            position: 'absolute',
            left: 80,
            top: 0,
            bottom: 0,
            width: 620,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          {/* Brand */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 32,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#4573A2',
                letterSpacing: 3,
                textTransform: 'uppercase',
                fontFamily: 'system-ui',
              }}
            >
              Claimondo
            </span>
            <div
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'rgba(69,115,162,0.5)',
                display: 'flex',
              }}
            />
            <span
              style={{
                fontSize: 14,
                color: 'rgba(123,163,204,0.6)',
                fontFamily: 'system-ui',
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              SV-Partner-Netzwerk
            </span>
          </div>

          {/* Haupttitel */}
          <div
            style={{
              fontSize: 58,
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.05,
              fontFamily: 'system-ui',
              letterSpacing: -1.5,
              marginBottom: 24,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>Partner werden.</span>
            <span style={{ color: '#7BA3CC' }}>Aufträge erhalten.</span>
          </div>

          {/* Trennlinie */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 28,
            }}
          >
            <div style={{ width: 48, height: 2, background: '#4573A2', display: 'flex' }} />
            <div style={{ flex: 1, height: 1, background: 'rgba(69,115,162,0.2)', display: 'flex' }} />
          </div>

          {/* Vorteile — kompakt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 36 }}>
            {[
              'Direktvermittlung ohne Eigenakquise',
              'DAT-Experten, BVSK, IHK & öbuv willkommen',
              'Einzugsgebiet selbst festlegen (30–100 km)',
            ].map((text, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#4573A2',
                    display: 'flex',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.75)', fontFamily: 'system-ui' }}>
                  {text}
                </span>
              </div>
            ))}
          </div>

          {/* CTA-Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 24px',
              background: 'rgba(69,115,162,0.18)',
              border: '1px solid rgba(69,115,162,0.45)',
              borderRadius: 10,
              width: 'fit-content',
            }}
          >
            <span style={{ fontSize: 16, color: '#7BA3CC', fontFamily: 'system-ui', fontWeight: 700 }}>
              Jetzt auf die Warteliste →
            </span>
          </div>
        </div>

        {/* Untere Referenzlinie */}
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            left: 80,
            right: 80,
            height: 1,
            background: 'rgba(69,115,162,0.15)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 22,
            left: 80,
          }}
        >
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', fontFamily: 'system-ui' }}>
            claimondo.de/gutachter-partner
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
