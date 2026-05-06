'use client'

// Flat-2D-Render des deutschen Kennzeichens — digital, weniger skeuomorph als
// die alte CMM-32-Polish-Variante. Kein Pressblech-Look mehr (keine Metall-
// Gradients, kein Embossed-Text, keine Chrom-Bolzen). Stattdessen flache
// Flächen mit einer dezenten Innen-Linie für Tiefe, Plaketten als solide
// Farbflächen ohne Pie-Sektoren. EU-Streifen flach navy.
//
// Public API (Props) bleibt identisch zu vorher — Consumers brauchen nichts
// zu ändern.

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
  huJahr,
  hideHuPlakette,
  // hideBolts wird ignoriert — flat-Render hat keine Bolzen mehr.
  // Prop bleibt für API-Kompatibilität erhalten.
  hideBolts: _hideBolts,
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
  /** @deprecated flat-Render zeigt keine Bolzen mehr — Prop bleibt nur für API-Kompat. */
  hideBolts?: boolean
  /** Wenn true, leichte Perspektiv-Neigung. */
  tilt?: boolean
}) {
  void _hideBolts
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
    sm: { h: 'h-9',  mainText: 'text-base',    euText: 'text-[7px]',  dText: 'text-[9px]',  pad: 'px-2.5', gap: 'gap-1.5', huSize: 14 },
    md: { h: 'h-12', mainText: 'text-xl',      euText: 'text-[8px]',  dText: 'text-[11px]', pad: 'px-3',   gap: 'gap-2',   huSize: 18 },
    lg: { h: 'h-16', mainText: 'text-3xl',     euText: 'text-[9px]',  dText: 'text-sm',     pad: 'px-3.5', gap: 'gap-2.5', huSize: 24 },
    xl: { h: 'h-20', mainText: 'text-[42px]',  euText: 'text-[11px]', dText: 'text-base',   pad: 'px-4',   gap: 'gap-3',   huSize: 30 },
  }[size]

  const jahr = huJahr ?? new Date().getFullYear() + 2

  return (
    <div
      className={`relative inline-flex items-stretch ${sizeCfg.h} rounded-lg select-none overflow-hidden`}
      style={{
        // Flache, leicht abgesetzte Plate — dünner dunkler Rand statt 3px schwarz,
        // dezenter Vertikal-Verlauf für minimale Tiefe ohne Pressblech-Optik.
        background: 'linear-gradient(180deg, #ffffff 0%, #f4f5f8 100%)',
        border: '1.5px solid #0D1B3E',
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.6) inset,' +
          '0 1px 2px rgba(13,27,62,0.08),' +
          '0 4px 10px rgba(13,27,62,0.06)',
        transform: tilt
          ? 'perspective(800px) rotateX(4deg) rotateY(-1deg)'
          : undefined,
        transformOrigin: tilt ? 'center bottom' : undefined,
      }}
      aria-label={`Kennzeichen ${parts.kreis} ${parts.buchstaben} ${parts.zahl}${parts.suffix ?? ''}`}
    >
      {/* EU-Streifen — flat navy, weiße Sterne, keine Gradients */}
      <div
        className="flex flex-col items-center justify-center px-1.5 py-0.5 text-white shrink-0"
        style={{ backgroundColor: '#0D1B3E' }}
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
            return <Star key={i} cx={cx} cy={cy} r={2.2} fill="#FFCC00" />
          })}
        </svg>
        <span className={`font-bold leading-none ${sizeCfg.dText}`} style={{ fontFamily: PLATE_FONT }}>
          D
        </span>
      </div>

      {/* Hauptbereich — flat black text, keine Embossed-Shadows */}
      <div
        className={`flex items-center ${sizeCfg.gap} ${sizeCfg.pad} font-extrabold tracking-[0.04em] text-[#0D1B3E] ${sizeCfg.mainText} flex-1`}
        style={{ fontFamily: PLATE_FONT }}
      >
        <span>{parts.kreis}</span>

        {parts.buchstaben && (
          <FlatPlakette size={sizeCfg.huSize - 4} variant="stadt" />
        )}

        {parts.buchstaben && <span>{parts.buchstaben}</span>}

        {parts.zahl && !hideHuPlakette && (
          <FlatPlakette size={sizeCfg.huSize - 2} variant="hu" jahr={jahr} />
        )}

        {parts.zahl && <span>{parts.zahl}</span>}

        {parts.suffix && (
          <span
            className={`ml-0.5 ${parts.suffix === 'E' ? 'text-claimondo-ondo' : 'text-amber-600'}`}
            title={parts.suffix === 'E' ? 'Elektrofahrzeug' : 'Oldtimer'}
          >
            {parts.suffix}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────

// Math.cos/sin koennen zwischen Node (SSR) und Browser leicht unterschiedliche
// Float-Precision liefern (V8-Internals), was bei der Hydration als
// Mismatch-Warning erscheint. round4 normalisiert auf 4 Nachkommastellen
// — visuell ohnehin unsichtbar, aber stabil.
const round4 = (n: number): number => Math.round(n * 10000) / 10000

function Star({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const points: string[] = []
  for (let i = 0; i < 10; i++) {
    const angle = (i * 36 - 90) * (Math.PI / 180)
    const radius = i % 2 === 0 ? r : r * 0.42
    points.push(`${round4(cx + Math.cos(angle) * radius)},${round4(cy + Math.sin(angle) * radius)}`)
  }
  return <polygon points={points.join(' ')} fill={fill} />
}

/** Flat-Plakette — runder Aufkleber als solide Farbfläche. Keine Pie-Sektoren,
 *  keine Wappen-Linien — nur Kontur + Jahres-Zahl bzw. Initiale. */
function FlatPlakette({
  size,
  variant,
  jahr,
}: {
  size: number
  variant: 'hu' | 'stadt'
  jahr?: number
}) {
  if (variant === 'hu') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ flexShrink: 0 }}>
        <circle cx="20" cy="20" r="18" fill="#FFC107" stroke="#0D1B3E" strokeWidth="2" />
        {jahr != null && (
          <text
            x="20"
            y="26"
            textAnchor="middle"
            fontSize="16"
            fontWeight="900"
            fill="#0D1B3E"
            style={{ fontFamily: PLATE_FONT }}
          >
            {String(jahr).slice(-2)}
          </text>
        )}
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="20" cy="20" r="18" fill="#ffffff" stroke="#0D1B3E" strokeWidth="2" />
      <circle cx="20" cy="20" r="11" fill="#0D1B3E" />
    </svg>
  )
}
