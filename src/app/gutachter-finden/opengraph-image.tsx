import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Kfz-Gutachter finden in Ihrer Nähe — sofort & zertifiziert | Claimondo'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Visuelles Motiv: Radar/Standort-Suche — konzentrische Kreise wie ein
// Sonar-Scan, der den nächsten Sachverständigen lokalisiert. Dunkel und
// präzise, mit dem Gefühl von Echtzeit-Technologie.
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          background: '#060f24',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Hintergrundraster */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(69,115,162,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(69,115,162,0.06) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
            display: 'flex',
          }}
        />

        {/* Radar-Motiv rechts — konzentrische Kreise */}
        <div
          style={{
            position: 'absolute',
            right: -80,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 520,
            height: 520,
          }}
        >
          {[480, 380, 280, 200, 130, 72].map((size, i) => (
            <div
              key={size}
              style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: '50%',
                border: `1px solid rgba(69,115,162,${0.08 + i * 0.06})`,
                display: 'flex',
              }}
            />
          ))}
          {/* Kreuz-Fadenkreuz in der Mitte */}
          <div
            style={{
              position: 'absolute',
              width: 1,
              height: 130,
              background: 'rgba(123,163,204,0.3)',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 130,
              height: 1,
              background: 'rgba(123,163,204,0.3)',
              display: 'flex',
            }}
          />
          {/* Ping-Punkt */}
          <div
            style={{
              position: 'absolute',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#4573A2',
              boxShadow: '0 0 0 4px rgba(69,115,162,0.2), 0 0 0 8px rgba(69,115,162,0.1)',
              display: 'flex',
            }}
          />

          {/* Zwei SV-Punkte auf dem Radar */}
          <div
            style={{
              position: 'absolute',
              top: 140,
              left: 110,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#7BA3CC',
              opacity: 0.9,
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 150,
              right: 100,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#7BA3CC',
              opacity: 0.6,
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 200,
              right: 90,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#4573A2',
              opacity: 0.7,
              display: 'flex',
            }}
          />
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
            width: 660,
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
              marginBottom: 36,
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
              Gutachter-Suche
            </span>
          </div>

          {/* Haupttitel — zweizeilig für Gewicht */}
          <div
            style={{
              fontSize: 62,
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.05,
              fontFamily: 'system-ui',
              letterSpacing: -1.5,
              marginBottom: 28,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>Kfz-Gutachter</span>
            <span style={{ color: '#7BA3CC' }}>in Ihrer Nähe</span>
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

          {/* Stats-Leiste */}
          <div style={{ display: 'flex', gap: 40, marginBottom: 36 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'white', fontFamily: 'system-ui', lineHeight: 1 }}>89+</span>
              <span style={{ fontSize: 14, color: '#4573A2', fontFamily: 'system-ui' }}>DAT-Experten</span>
            </div>
            <div style={{ width: 1, height: 52, background: 'rgba(69,115,162,0.25)', display: 'flex', alignSelf: 'center' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'white', fontFamily: 'system-ui', lineHeight: 1 }}>&lt;48h</span>
              <span style={{ fontSize: 14, color: '#4573A2', fontFamily: 'system-ui' }}>Termin garantiert</span>
            </div>
            <div style={{ width: 1, height: 52, background: 'rgba(69,115,162,0.25)', display: 'flex', alignSelf: 'center' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#7BA3CC', fontFamily: 'system-ui', lineHeight: 1 }}>0 €</span>
              <span style={{ fontSize: 14, color: '#4573A2', fontFamily: 'system-ui' }}>nach §249 BGB</span>
            </div>
          </div>

          {/* CTA-Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 24px',
              background: 'rgba(69,115,162,0.15)',
              border: '1px solid rgba(69,115,162,0.4)',
              borderRadius: 10,
              width: 'fit-content',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="8" stroke="#7BA3CC" strokeWidth="1.5" />
              <path d="M21 21l-4.35-4.35" stroke="#7BA3CC" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 16, color: '#7BA3CC', fontFamily: 'system-ui', fontWeight: 600 }}>
              Jetzt Gutachter suchen
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
            claimondo.de/gutachter-finden
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
