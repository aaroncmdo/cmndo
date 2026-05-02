'use client'

// CMM-32 Polish: Visueller deutscher Kennzeichenhalter im Euro-Style
// (schwarzer Rand, blauer EU-Streifen mit Sternen + D, geprägte
// Buchstaben in DIN-Style). Render-only — kein Editing.
//
// Phase 1: Wir splitten den existierenden `kennzeichen`-String per
// Regex, weil die DB-Migration auf strukturierte Spalten erst Phase 2 ist.
// Der Splitter erkennt:
//   "K-AS 1234"   → kreis="K", buchstaben="AS", zahl="1234", suffix=null
//   "K AS 1234E"  → ..., suffix="E" (Elektrofahrzeug)
//   "B-MW 100 H"  → ..., suffix="H" (Oldtimer)

export function parseKennzeichen(raw: string | null): {
  kreis: string
  buchstaben: string
  zahl: string
  suffix: string | null
} | null {
  if (!raw) return null
  const trimmed = raw.replace(/\s+/g, ' ').trim().toUpperCase()
  // Pattern: 1-3 Großbuchstaben (Kreis) — Trenner — 1-2 Buchstaben — Trenner —
  // 1-4 Ziffern — optional E oder H als Suffix
  const m = /^([A-ZÄÖÜ]{1,3})[\s-]*([A-Z]{1,2})[\s-]*(\d{1,4})\s*([EH])?$/.exec(trimmed)
  if (!m) {
    // Fallback: gibt es überhaupt was? Dann roh anzeigen statt nichts.
    return { kreis: trimmed, buchstaben: '', zahl: '', suffix: null }
  }
  return { kreis: m[1], buchstaben: m[2], zahl: m[3], suffix: m[4] ?? null }
}

export default function Kennzeichenhalter({
  kennzeichen,
  size = 'md',
}: {
  kennzeichen: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const parts = parseKennzeichen(kennzeichen)
  if (!parts) return null

  const sizeCfg = {
    sm: { h: 'h-10', mainText: 'text-lg', euText: 'text-[8px]', dText: 'text-[10px]' },
    md: { h: 'h-14', mainText: 'text-2xl', euText: 'text-[10px]', dText: 'text-sm' },
    lg: { h: 'h-20', mainText: 'text-4xl', euText: 'text-[11px]', dText: 'text-base' },
  }[size]

  return (
    <div
      className={`inline-flex items-stretch ${sizeCfg.h} rounded-md border-[3px] border-black bg-white shadow-sm overflow-hidden select-none`}
      style={{ fontFamily: '"FE-Schrift", "Courier New", monospace' }}
      aria-label={`Kennzeichen ${parts.kreis} ${parts.buchstaben} ${parts.zahl}${parts.suffix ?? ''}`}
    >
      {/* Linker EU-Streifen */}
      <div className="bg-[#003399] flex flex-col items-center justify-center px-1.5 py-0.5 text-white shrink-0">
        {/* 12 EU-Sterne als Kreis-Andeutung — vereinfacht als Sternchen-Zeile */}
        <div className={`leading-none ${sizeCfg.euText} tracking-tighter`}>★ ★ ★</div>
        <div className={`leading-none ${sizeCfg.euText} tracking-tighter`}>★ ★</div>
        <div className={`leading-none ${sizeCfg.euText} tracking-tighter`}>★ ★ ★</div>
        <div className={`font-bold leading-none mt-0.5 ${sizeCfg.dText}`}>D</div>
      </div>

      {/* Haupt-Bereich mit Buchstaben + Zahlen */}
      <div className={`flex items-center gap-2.5 px-3 font-bold tracking-wider text-black ${sizeCfg.mainText}`}>
        <span>{parts.kreis}</span>
        {parts.buchstaben && (
          <>
            {/* Plakettenpunkt-Stelle (vereinfacht als kleiner Kreis) */}
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-black/80 mx-0.5" />
            <span>{parts.buchstaben}</span>
          </>
        )}
        {parts.zahl && (
          <>
            <span className="inline-block w-1 h-1 rounded-full bg-black/60" />
            <span>{parts.zahl}</span>
          </>
        )}
        {parts.suffix && (
          <span
            className={`ml-0.5 ${parts.suffix === 'E'
              ? 'text-[#003399]'
              : 'text-[#7a5b18]'} font-extrabold`}
            title={parts.suffix === 'E' ? 'Elektrofahrzeug' : 'Oldtimer'}
          >
            {parts.suffix}
          </span>
        )}
      </div>
    </div>
  )
}
