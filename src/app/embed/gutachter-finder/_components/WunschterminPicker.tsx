'use client'

// AAR-956 (Aaron 12.06.): eigener Wunschtermin-Picker im Claimondo-Look + deutsches Format.
// Der native <input type="datetime-local"> rendert im Browser-Locale (US: MM/DD/YYYY hh:mm AM/PM)
// und ist nicht stylebar — daher ein eigener Picker: Datums-Chips (nächste Werktage, „Di 16.06.")
// + Zeit-Chips (08–18 Uhr). Gibt „YYYY-MM-DDTHH:MM" (Berlin-Wall-Clock) zurück, das die Action
// via berlinWallClockToUtc an die Engine reicht.

import { useEffect, useState } from 'react'

const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const ZEITEN = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

export function WunschterminPicker({
  value,
  onChange,
}: {
  /** "YYYY-MM-DDTHH:MM" oder "" */
  value: string
  onChange: (v: string) => void
}) {
  const [datum, zeit] = value ? value.split('T') : ['', '']

  // Nächste 14 Werktage (Sonntag raus). HYDRATION-SAFE: `new Date()` erst NACH dem Mount
  // (useEffect), sonst differiert die Server-SSR-Liste (Server=UTC) von der Client-Liste
  // (Browser=Berlin) an Tagesgrenzen → Hydration-Mismatch. Server rendert leer, Client füllt.
  const [tage, setTage] = useState<{ iso: string; tag: string; wtag: string }[]>([])
  useEffect(() => {
    const out: { iso: string; tag: string; wtag: string }[] = []
    const heute = new Date()
    for (let i = 0; out.length < 14 && i < 21; i++) {
      const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + i)
      if (d.getDay() === 0) continue // Sonntag aus
      const y = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, '0')
      const da = String(d.getDate()).padStart(2, '0')
      out.push({ iso: `${y}-${mo}-${da}`, tag: `${da}.${mo}.`, wtag: WOCHENTAG[d.getDay()] })
    }
    setTage(out)
  }, [])

  function waehleDatum(iso: string) {
    onChange(`${iso}T${zeit || '10:00'}`)
  }
  function waehleZeit(z: string) {
    onChange(`${datum || tage[0]?.iso}T${z}`)
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Datum — horizontale Chip-Reihe */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
        {tage.map((t) => {
          const aktiv = datum === t.iso
          return (
            <button
              key={t.iso}
              type="button"
              onClick={() => waehleDatum(t.iso)}
              className={`flex min-w-[3.25rem] flex-shrink-0 flex-col items-center rounded-ios-md border px-2 py-1.5 transition-colors ${
                aktiv
                  ? 'border-claimondo-ondo bg-claimondo-ondo text-white'
                  : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
              }`}
            >
              <span className={`text-[0.625rem] font-semibold uppercase ${aktiv ? 'text-white/80' : 'text-claimondo-shield/60'}`}>
                {t.wtag}
              </span>
              <span className="text-[0.8125rem] font-bold leading-tight">{t.tag}</span>
            </button>
          )
        })}
      </div>
      {/* Zeit — horizontale Chip-Leiste (scrollbar, wie die Datums-Reihe) statt dichtem
          Wrap über 2–3 Zeilen. AAR-956 (Aaron 14.06.): eine ruhige Bewegungs-Sprache. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
        {ZEITEN.map((z) => {
          const aktiv = zeit === z
          return (
            <button
              key={z}
              type="button"
              onClick={() => waehleZeit(z)}
              className={`flex-shrink-0 rounded-ios-md border px-2.5 py-1.5 text-[0.8125rem] font-semibold transition-colors ${
                aktiv
                  ? 'border-claimondo-ondo bg-claimondo-ondo text-white'
                  : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
              }`}
            >
              {z}
            </button>
          )
        })}
      </div>
    </div>
  )
}
