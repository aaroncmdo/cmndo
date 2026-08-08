'use client'

// AAR-956 (Aaron 12.06.): eigener Wunschtermin-Picker im Claimondo-Look + deutsches Format.
// Der native <input type="datetime-local"> rendert im Browser-Locale (US: MM/DD/YYYY hh:mm AM/PM)
// und ist nicht stylebar — daher ein eigener Picker: Datums-Chips (nächste Werktage, „Di 16.06.")
// + Zeit-Chips (08–18 Uhr). Gibt „YYYY-MM-DDTHH:MM" (Berlin-Wall-Clock) zurück, das die Action
// via berlinWallClockToUtc an die Engine reicht.

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { naechsteWerktage, zukunftsZeiten, type TagOption } from './wunschtermin-slots'

const ZEITEN = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

// AAR-956 (Aaron 14.06.): horizontale Scroll-Leiste. Touch (Handy/iPad, <lg) = nativ wischen.
// Desktop (≥lg) kann so einen Strip NICHT wischen → ‹ ›-Pfeile, die nur erscheinen, wenn in die
// jeweilige Richtung noch etwas zu scrollen ist. `watch` triggert die Pfeil-Neuberechnung, wenn
// sich der Inhalt ändert (z.B. wenn die Datums-Chips asynchron nachladen).
function HScroll({ children, watch }: { children: React.ReactNode; watch?: unknown }) {
  const ref = useRef<HTMLDivElement>(null)
  const [canL, setCanL] = useState(false)
  const [canR, setCanR] = useState(false)
  function update() {
    const el = ref.current
    if (!el) return
    setCanL(el.scrollLeft > 4)
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(update, [watch])
  useEffect(() => {
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  function scroll(dir: number) {
    ref.current?.scrollBy({ left: dir * 150, behavior: 'smooth' })
  }
  const pfeil =
    'hidden lg:flex absolute top-1/2 z-10 h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-claimondo-border bg-white/95 text-claimondo-navy shadow-ios-sm transition-colors hover:border-claimondo-ondo'
  return (
    <div className="relative">
      {canL && (
        <button type="button" aria-label="Frühere anzeigen" onClick={() => scroll(-1)} className={`${pfeil} left-0`}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div
        ref={ref}
        onScroll={update}
        className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {children}
      </div>
      {canR && (
        <button type="button" aria-label="Weitere anzeigen" onClick={() => scroll(1)} className={`${pfeil} right-0`}>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function WunschterminPicker({
  value,
  onChange,
}: {
  /** "YYYY-MM-DDTHH:MM" oder "" */
  value: string
  onChange: (v: string) => void
}) {
  const [datum, zeit] = value ? value.split('T') : ['', '']

  // Nächste 14 Werktage (Sonntag raus) + Vergangenheits-Filter. HYDRATION-SAFE: `new Date()`
  // erst NACH dem Mount (useEffect), sonst differiert die Server-SSR-Liste (Server=UTC) von der
  // Client-Liste (Browser=Berlin) an Tagesgrenzen → Hydration-Mismatch. Server rendert leer,
  // Client füllt. Reine Logik + Vergangenheits-Ausschluss in ./wunschtermin-slots (unit-getestet).
  const [opts, setOpts] = useState<{ tage: TagOption[]; todayIso: string; nowHour: number }>({
    tage: [],
    todayIso: '',
    nowHour: -1,
  })
  useEffect(() => {
    setOpts(naechsteWerktage(new Date(), ZEITEN, 14))
  }, [])
  const { tage, todayIso, nowHour } = opts

  // Effektives Datum = was ein Zeit-Klick erzeugt (gewähltes ODER erstes verfügbares). Die
  // Zeit-Chips filtern darauf → für HEUTE keine vergangenen/laufenden Uhrzeiten mehr.
  const effektivesDatum = datum || tage[0]?.iso || ''
  const verfuegbareZeiten = zukunftsZeiten(ZEITEN, effektivesDatum, todayIso, nowHour)

  function waehleDatum(iso: string) {
    // Getragene Zeit behalten, falls sie am neuen Datum noch gültig ist — sonst auf den ersten
    // verfügbaren Slot fallen (verhindert, dass beim Wechsel auf heute eine vergangene Zeit bleibt).
    const verf = zukunftsZeiten(ZEITEN, iso, todayIso, nowHour)
    const z = zeit && verf.includes(zeit) ? zeit : (verf[0] ?? '10:00')
    onChange(`${iso}T${z}`)
  }
  function waehleZeit(z: string) {
    onChange(`${effektivesDatum}T${z}`)
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Datum — horizontale Leiste: Touch wischen, Desktop Pfeile */}
      <HScroll watch={tage.length}>
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
      </HScroll>
      {/* Zeit — horizontale Leiste: Touch wischen, Desktop Pfeile. Für heute nur Zukunfts-Slots. */}
      <HScroll watch={verfuegbareZeiten.length}>
        {verfuegbareZeiten.map((z) => {
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
      </HScroll>
    </div>
  )
}
