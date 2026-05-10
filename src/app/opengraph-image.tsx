import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Claimondo — Vollständige Schadensregulierung auf Augenhöhe'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Precision-Engineering Aesthetic: feine Grid-Linien wie ein technisches
// Referenzdokument — Claimondo als Präzisionsinstrument für Schadensrecht.
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
        {/* Hintergrundraster — technische Zeichnung */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(69,115,162,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(69,115,162,0.08) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            display: 'flex',
          }}
        />

        {/* Diagonale Akzentlinie */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 320,
            width: 1,
            height: 630,
            background: 'linear-gradient(to bottom, transparent, rgba(123,163,204,0.3), rgba(123,163,204,0.6), rgba(123,163,204,0.3), transparent)',
            transform: 'rotate(15deg) translateX(40px)',
            transformOrigin: 'top center',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 280,
            width: 1,
            height: 630,
            background: 'linear-gradient(to bottom, transparent, rgba(69,115,162,0.2), rgba(69,115,162,0.4), rgba(69,115,162,0.2), transparent)',
            transform: 'rotate(15deg)',
            transformOrigin: 'top center',
            display: 'flex',
          }}
        />

        {/* Rechte geometrische Figur — Schild/Shield-Motiv */}
        <div
          style={{
            position: 'absolute',
            right: 80,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 280,
            height: 320,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Äußerer Kreis */}
          <div
            style={{
              position: 'absolute',
              width: 260,
              height: 260,
              borderRadius: '50%',
              border: '1px solid rgba(69,115,162,0.3)',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 200,
              height: 200,
              borderRadius: '50%',
              border: '1px solid rgba(69,115,162,0.2)',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 140,
              height: 140,
              borderRadius: '50%',
              border: '1px solid rgba(123,163,204,0.25)',
              display: 'flex',
            }}
          />
          {/* Inneres Schild-Icon */}
          <div
            style={{
              width: 80,
              height: 80,
              background: 'rgba(69,115,162,0.15)',
              border: '1.5px solid rgba(123,163,204,0.5)',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"
                stroke="#7BA3CC"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="rgba(69,115,162,0.2)"
              />
              <path
                d="M9 12l2 2 4-4"
                stroke="#7BA3CC"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Linkes Messskalen-Detail */}
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
        {[80, 160, 240, 320, 400, 480, 560].map((y) => (
          <div
            key={y}
            style={{
              position: 'absolute',
              left: 3,
              top: y,
              width: 12,
              height: 1,
              background: 'rgba(69,115,162,0.5)',
              display: 'flex',
            }}
          />
        ))}

        {/* Hauptinhalt */}
        <div
          style={{
            position: 'absolute',
            left: 80,
            top: 0,
            bottom: 0,
            width: 700,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 0,
          }}
        >
          {/* Oberer Label */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 32,
            }}
          >
            <div
              style={{
                width: 32,
                height: 2,
                background: '#4573A2',
                display: 'flex',
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#4573A2',
                letterSpacing: 4,
                textTransform: 'uppercase',
                fontFamily: 'system-ui',
              }}
            >
              KFZ-Schadensmanagement
            </span>
          </div>

          {/* Haupttitel */}
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.0,
              fontFamily: 'system-ui',
              letterSpacing: -2,
              marginBottom: 24,
              display: 'flex',
            }}
          >
            Claimondo
          </div>

          {/* Trennlinie mit Zier-Element */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 28,
            }}
          >
            <div
              style={{
                width: 48,
                height: 2,
                background: 'linear-gradient(to right, #4573A2, transparent)',
                display: 'flex',
              }}
            />
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#7BA3CC',
                display: 'flex',
              }}
            />
            <div
              style={{
                flex: 1,
                height: 1,
                background: 'rgba(69,115,162,0.25)',
                display: 'flex',
              }}
            />
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 26,
              color: '#7BA3CC',
              lineHeight: 1.4,
              fontFamily: 'system-ui',
              fontWeight: 400,
              marginBottom: 40,
              display: 'flex',
            }}
          >
            Vollständige Schadensregulierung — auf Augenhöhe
          </div>

          {/* Feature-Chips */}
          <div style={{ display: 'flex', gap: 10 }}>
            {['Gutachten', 'Werkstatt', 'Anwalt', 'Auszahlung'].map((item) => (
              <div
                key={item}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  background: 'rgba(69,115,162,0.12)',
                  border: '1px solid rgba(69,115,162,0.3)',
                  color: '#7BA3CC',
                  fontSize: 15,
                  fontFamily: 'system-ui',
                  fontWeight: 500,
                  display: 'flex',
                }}
              >
                {item}
              </div>
            ))}
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
            background: 'rgba(69,115,162,0.2)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 80,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.25)',
              fontFamily: 'system-ui',
            }}
          >
            claimondo.de
          </span>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            right: 80,
            display: 'flex',
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: 'rgba(69,115,162,0.5)',
              fontFamily: 'system-ui',
              letterSpacing: 2,
            }}
          >
            §249 BGB · DAT-zertifiziert
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
