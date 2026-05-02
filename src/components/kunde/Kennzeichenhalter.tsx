'use client'

// CMM-32 Polish: Visueller deutscher Kennzeichenhalter im Euro-Style.
// Nutzt strukturierte Felder (kreis/buchstaben/zahl/suffix) wenn vorhanden,
// faellt sonst auf Regex-Parse vom kennzeichen-Komplettstring zurueck.
// Embossing via inset-shadow + Highlight-Linien fuer leichten 3D-Look.

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

export default function Kennzeichenhalter({
  kennzeichen,
  kreis,
  buchstaben,
  zahl,
  suffix,
  size = 'md',
}: {
  kennzeichen?: string | null
  kreis?: string | null
  buchstaben?: string | null
  zahl?: string | null
  suffix?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
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
    sm: { h: 'h-9',  mainText: 'text-base',  euText: 'text-[7px]',  dText: 'text-[9px]',  pad: 'px-2.5', gap: 'gap-1.5' },
    md: { h: 'h-12', mainText: 'text-xl',    euText: 'text-[9px]',  dText: 'text-[11px]', pad: 'px-3',   gap: 'gap-2'   },
    lg: { h: 'h-16', mainText: 'text-3xl',   euText: 'text-[10px]', dText: 'text-sm',     pad: 'px-3.5', gap: 'gap-2.5' },
    xl: { h: 'h-20', mainText: 'text-[42px]',euText: 'text-[11px]', dText: 'text-base',   pad: 'px-4',   gap: 'gap-3'   },
  }[size]

  return (
    <div
      className={`inline-flex items-stretch ${sizeCfg.h} rounded-md border-[3px] border-black bg-white select-none`}
      style={{
        // Embossing: leichte Inset-Shadow gibt 3D-Effekt, Outset-Shadow den Tiefen-Plot
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.6),' +
          'inset 0 -2px 0 rgba(0,0,0,0.08),' +
          '0 1px 2px rgba(0,0,0,0.15),' +
          '0 4px 10px rgba(0,0,0,0.18)',
      }}
      aria-label={`Kennzeichen ${parts.kreis} ${parts.buchstaben} ${parts.zahl}${parts.suffix ?? ''}`}
    >
      {/* Linker EU-Streifen */}
      <div
        className="bg-[#003399] flex flex-col items-center justify-center px-1.5 py-0.5 text-white shrink-0"
        style={{ boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.15)' }}
      >
        <div className={`leading-[1.1] ${sizeCfg.euText} tracking-tighter text-[#FFCC00] select-none`}>★ ★ ★</div>
        <div className={`leading-[1.1] ${sizeCfg.euText} tracking-tighter text-[#FFCC00]`}>★ ★ ★</div>
        <div className={`font-bold leading-none mt-0.5 ${sizeCfg.dText}`}>D</div>
      </div>

      {/* Haupt-Bereich mit Buchstaben + Zahlen */}
      <div
        className={`flex items-center ${sizeCfg.gap} ${sizeCfg.pad} font-extrabold tracking-[0.04em] text-black ${sizeCfg.mainText}`}
        style={{
          fontFamily: '"FE-Schrift", "DIN 1451", "Courier New", monospace',
          textShadow: '0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        <span>{parts.kreis}</span>
        {parts.buchstaben && (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)]" />
            <span>{parts.buchstaben}</span>
          </>
        )}
        {parts.zahl && (
          <>
            <span className="inline-block w-1 h-1 rounded-full bg-black/70" />
            <span>{parts.zahl}</span>
          </>
        )}
        {parts.suffix && (
          <span
            className={`ml-0.5 ${parts.suffix === 'E' ? 'text-[#003399]' : 'text-[#7a5b18]'}`}
            title={parts.suffix === 'E' ? 'Elektrofahrzeug' : 'Oldtimer'}
          >
            {parts.suffix}
          </span>
        )}
      </div>
    </div>
  )
}
