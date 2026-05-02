'use client'

// CMM-32 Polish: Realistischer deutscher Kennzeichenhalter im Euro-Style.
// Aufbau:
//   - Schwarzer Aussenrand mit leichtem Highlight (3D-Effekt)
//   - Metallisches Body-Gradient (silber-weiss-Verlauf)
//   - Linker EU-Streifen mit 12-Stern-Kreis + 'D'
//   - HU-Plakette (rund, gelb/blau/braun je nach Jahr — vereinfacht gelb)
//     mit Jahreszahl + 12-Pie-Aufteilung
//   - 4 Bolzenkoepfe in den Ecken (vereinfacht als kleine Kreise)
//   - FE-Schrift-Font (faellt auf Mono-Stack zurueck wenn Datei fehlt)
//
// Fonts: FE-Schrift muss in public/fonts/fe-schrift.woff2 liegen (siehe
// globals.css fuer den @font-face). Falls nicht: graceful fallback.

export function parseKennzeichen(raw: string | null): {
  kreis: string
  buchstaben: string
  zahl: string
  suffix: string | null
} | null {
  if (!raw) return null
  const trimmed = raw.replace(/\s+/g, ' ').trim().toUpperCase()
  const m = /^([A-ZÄÖÜ]{1,3})[\s-]*([A-Z]{1,2})[\s-]*(\d{1,4})\s*([EH])?$/.exec(trimmed)
  if (!m) return { kreis: trimmed, buchstaben: '', zahl: '', suffix: null }
  return { kreis: m[1], buchstaben: m[2], zahl: m[3], suffix: m[4] ?? null }
}

const PLATE_FONT = '"FE-Schrift", "DIN 1451 Std", "Roboto Mono", "Courier New", monospace'

export default function Kennzeichenhalter({
  kennzeichen,
  kreis,
  buchstaben,
  zahl,
  suffix,
  size = 'md',
  /** Optional: Jahr fuer die HU-Plakette (Zahl im Kreis). Default: aktuelles Jahr+2. */
  huJahr,
  /** Wenn true, wird die HU-Plakette ausgeblendet. */
  hideHuPlakette,
  /** Wenn true, werden die Befestigungs-Bolzen ausgeblendet. */
  hideBolts,
  /** Wenn true, leichte Perspektiv-Neigung für 3D-Effekt (gut für Karten). */
  tilt,
}: {
  kennzeichen?: string | null
  kreis?: string | null
  buchstaben?: string | null
  zahl?: string | null
  suffix?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  huJahr?: number
  hideHuPlakette?: boolean
  hideBolts?: boolean
  tilt?: boolean
}) {
  const strukturiert = kreis || buchstaben || zahl
    ? {
        kreis: (kreis ?? '').toUpperCase(),
        buchstaben: (buchstaben ?? '').toUpperCase(),
        zahl: zahl ?? '',
        suffix: suffix === 'E' || suffix === 'H' ? suffix : null,
      }
    : null
  const parts = strukturiert ?? parseKennzeichen(kennzeichen ?? null)
  if (!parts) return null

  const sizeCfg = {
    sm: { h: 'h-9',  mainText: 'text-base',    euText: 'text-[7px]',  dText: 'text-[9px]',  pad: 'px-2.5', gap: 'gap-1.5', huSize: 14, boltSize: 3 },
    md: { h: 'h-12', mainText: 'text-xl',      euText: 'text-[8px]',  dText: 'text-[11px]', pad: 'px-3',   gap: 'gap-2',   huSize: 18, boltSize: 4 },
    lg: { h: 'h-16', mainText: 'text-3xl',     euText: 'text-[9px]',  dText: 'text-sm',     pad: 'px-3.5', gap: 'gap-2.5', huSize: 24, boltSize: 5 },
    xl: { h: 'h-20', mainText: 'text-[42px]',  euText: 'text-[11px]', dText: 'text-base',   pad: 'px-4',   gap: 'gap-3',   huSize: 30, boltSize: 6 },
  }[size]

  const jahr = huJahr ?? new Date().getFullYear() + 2

  return (
    <div
      className={`relative inline-flex items-stretch ${sizeCfg.h} rounded-md border-[3px] border-black select-none`}
      style={{
        // Feines Metall-Pressblech: Highlight oben → weiß Mitte → Schatten unten
        background:
          'linear-gradient(180deg,' +
          '#fdfdfd 0%,' +
          '#f0f1f4 18%,' +
          '#fafbfc 42%,' +
          '#f8f9fb 58%,' +
          '#e8eaef 80%,' +
          '#d4d6dc 100%)',
        boxShadow:
          // Gepresstes Blech: Aluminium-Randlicht innen
          'inset 0 1.5px 0 rgba(255,255,255,0.95),' +
          'inset 0 -1.5px 0 rgba(0,0,0,0.18),' +
          'inset 1px 0 0 rgba(255,255,255,0.55),' +
          'inset -1px 0 0 rgba(0,0,0,0.10),' +
          // Nahschatten (Kontakt)
          '0 1px 0 rgba(255,255,255,0.12),' +
          '0 2px 4px rgba(0,0,0,0.30),' +
          // Tiefenschatten (Float)
          '0 6px 14px rgba(0,0,0,0.22),' +
          '0 14px 28px rgba(0,0,0,0.14)',
        // 3D-Tilt: leichte Perspektiv-Neigung
        transform: tilt
          ? 'perspective(600px) rotateX(6deg) rotateY(-1deg)'
          : undefined,
        transformOrigin: tilt ? 'center bottom' : undefined,
      }}
      aria-label={`Kennzeichen ${parts.kreis} ${parts.buchstaben} ${parts.zahl}${parts.suffix ?? ''}`}
    >
      {/* EU-Streifen mit echtem 12-Stern-Kreis als SVG */}
      <div
        className="flex flex-col items-center justify-center px-1.5 py-0.5 text-white shrink-0 relative"
        style={{
          // Echter EU-Blau-Gradient mit leichtem 3D-Glanz
          background: 'linear-gradient(170deg, #0044cc 0%, #003399 35%, #002b80 75%, #002070 100%)',
          boxShadow:
            'inset 1px 0 0 rgba(255,255,255,0.15),' +
            'inset -1px 0 0 rgba(0,0,0,0.30),' +
            'inset 0 1px 0 rgba(255,255,255,0.20),' +
            'inset 0 -1px 0 rgba(0,0,0,0.25)',
        }}
      >
        <svg
          width={sizeCfg.huSize}
          height={sizeCfg.huSize}
          viewBox="0 0 40 40"
          aria-hidden
          style={{ marginBottom: 1 }}
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 - 90) * (Math.PI / 180)
            const cx = 20 + Math.cos(angle) * 13
            const cy = 20 + Math.sin(angle) * 13
            return (
              <Star key={i} cx={cx} cy={cy} r={2.4} fill="#FFCC00" />
            )
          })}
        </svg>
        <span className={`font-bold leading-none ${sizeCfg.dText}`} style={{ fontFamily: PLATE_FONT }}>
          D
        </span>
      </div>

      {/* Hauptbereich */}
      <div
        className={`flex items-center ${sizeCfg.gap} ${sizeCfg.pad} font-extrabold tracking-[0.04em] text-black ${sizeCfg.mainText} flex-1 relative`}
        style={{
          fontFamily: PLATE_FONT,
          // Embossed-Schrift: Buchstaben wirken gepresst/erhaben
          textShadow:
            '0 -1px 0 rgba(0,0,0,0.20),' +    // gedrückte Oberkante
            '0 1px 0 rgba(255,255,255,0.90),' + // Highlight-Unterkante
            '0 2px 3px rgba(0,0,0,0.14)',       // Tiefenschatten
        }}
      >
        <span>{parts.kreis}</span>

        {/* Stempel-/Kreis-Plakette zwischen Kreis und Buchstaben */}
        {parts.buchstaben && (
          <SealPlakette size={sizeCfg.huSize - 4} variant="stadt" />
        )}

        {parts.buchstaben && <span>{parts.buchstaben}</span>}

        {/* HU-Plakette zwischen Buchstaben und Zahl */}
        {parts.zahl && !hideHuPlakette && (
          <SealPlakette size={sizeCfg.huSize - 2} variant="hu" jahr={jahr} />
        )}

        {parts.zahl && <span>{parts.zahl}</span>}

        {parts.suffix && (
          <span
            className={`ml-0.5 ${parts.suffix === 'E' ? 'text-[#003399]' : 'text-[#7a5b18]'}`}
            title={parts.suffix === 'E' ? 'Elektrofahrzeug' : 'Oldtimer'}
          >
            {parts.suffix}
          </span>
        )}

        {/* Befestigungs-Bolzen in den Ecken */}
        {!hideBolts && (
          <>
            <Bolt position="tl" size={sizeCfg.boltSize} />
            <Bolt position="tr" size={sizeCfg.boltSize} />
            <Bolt position="bl" size={sizeCfg.boltSize} />
            <Bolt position="br" size={sizeCfg.boltSize} />
          </>
        )}
      </div>
    </div>
  )
}

// ─── SVG-Subcomponents ─────────────────────────────────────────────────────

function Star({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  // 5-zackiger Stern via path approximiert
  const points: string[] = []
  for (let i = 0; i < 10; i++) {
    const angle = (i * 36 - 90) * (Math.PI / 180)
    const radius = i % 2 === 0 ? r : r * 0.42
    points.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`)
  }
  return <polygon points={points.join(' ')} fill={fill} />
}

/** Plakette = runder Aufkleber. variant='hu' = HU-Plakette (gelb mit Jahr +
 *  Pie-Aufteilung), variant='stadt' = Kreis-Stempel (schwarz mit Wappen-
 *  Andeutung). */
function SealPlakette({
  size,
  variant,
  jahr,
}: {
  size: number
  variant: 'hu' | 'stadt'
  jahr?: number
}) {
  if (variant === 'hu') {
    // HU-Plakette: aktuelles Jahr-Farbschema vereinfacht zu Gelb
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ flexShrink: 0 }}>
        <circle cx="20" cy="20" r="19" fill="#FFC107" stroke="#000" strokeWidth="1.5" />
        {/* 12 Pie-Sektionen */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle1 = (i * 30 - 90) * (Math.PI / 180)
          const angle2 = ((i + 1) * 30 - 90) * (Math.PI / 180)
          const x1 = 20 + Math.cos(angle1) * 18
          const y1 = 20 + Math.sin(angle1) * 18
          const x2 = 20 + Math.cos(angle2) * 18
          const y2 = 20 + Math.sin(angle2) * 18
          return (
            <line key={i} x1="20" y1="20" x2={(x1 + x2) / 2} y2={(y1 + y2) / 2} stroke="rgba(0,0,0,0.4)" strokeWidth="0.6" />
          )
        })}
        {jahr != null && (
          <text
            x="20"
            y="26"
            textAnchor="middle"
            fontSize="14"
            fontWeight="900"
            fill="#000"
            style={{ fontFamily: PLATE_FONT }}
          >
            {String(jahr).slice(-2)}
          </text>
        )}
      </svg>
    )
  }
  // Stadt-Stempel: schwarzer Kreis mit Wappen-Andeutung
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="20" cy="20" r="19" fill="none" stroke="#000" strokeWidth="2" />
      <circle cx="20" cy="20" r="14" fill="none" stroke="#000" strokeWidth="0.8" />
      {/* Wappen-Andeutung: Schild */}
      <path
        d="M20 8 L26 11 L26 22 Q26 27 20 30 Q14 27 14 22 L14 11 Z"
        fill="rgba(0,0,0,0.15)"
        stroke="#000"
        strokeWidth="0.8"
      />
    </svg>
  )
}

function Bolt({
  position,
  size,
}: {
  position: 'tl' | 'tr' | 'bl' | 'br'
  size: number
}) {
  const positions: Record<typeof position, string> = {
    tl: 'top-1 left-1',
    tr: 'top-1 right-1',
    bl: 'bottom-1 left-1',
    br: 'bottom-1 right-1',
  }
  const s = size
  return (
    <svg
      className={`absolute ${positions[position]} pointer-events-none`}
      width={s}
      height={s}
      viewBox="0 0 10 10"
      aria-hidden
    >
      {/* Schraubenkopf — Chrom-Radialverlauf */}
      <defs>
        <radialGradient id={`bolt-${position}`} cx="35%" cy="28%" r="65%">
          <stop offset="0%"   stopColor="#e8ecf3" />
          <stop offset="40%"  stopColor="#9aa0ae" />
          <stop offset="75%"  stopColor="#52586a" />
          <stop offset="100%" stopColor="#2a2e3a" />
        </radialGradient>
      </defs>
      <circle cx="5" cy="5" r="4.5" fill={`url(#bolt-${position})`} />
      {/* Schlitz — simuliert echten Kreuzschlitz */}
      <line x1="5" y1="2.2" x2="5" y2="7.8" stroke="rgba(0,0,0,0.5)" strokeWidth="1" strokeLinecap="round" />
      <line x1="2.2" y1="5" x2="7.8" y2="5" stroke="rgba(0,0,0,0.5)" strokeWidth="1" strokeLinecap="round" />
      {/* Specular-Highlight */}
      <ellipse cx="3.8" cy="3.2" rx="1.4" ry="0.9" fill="rgba(255,255,255,0.45)" transform="rotate(-35 3.8 3.2)" />
    </svg>
  )
}
