'use client'

// CMM-40: Slot-Picker fuer Re-Termin-Buchung. Mobile-First.
// Tage als horizontale Spalten, pro Tag 4 Slots untereinander. Slots die mit
// existierenden SV-Terminen kollidieren, sind disabled und durchgestrichen.

import { useMemo, useState, useTransition } from 'react'

type Slot = {
  startIso: string
  tagLabel: string
  zeitLabel: string
  available: boolean
  dateKey: string
}

type Props = {
  token: string
  vorname: string | null
  kennzeichen: string | null
  schadensOrt: string | null
  slots: Slot[]
  onSubmit: (token: string, slotStartIso: string) => Promise<{ ok: boolean; error?: string }>
}

export default function ReTerminPickerClient({ token, vorname, kennzeichen, schadensOrt, slots, onSubmit }: Props) {
  const [selectedIso, setSelectedIso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  const tageGruppen = useMemo(() => {
    const map = new Map<string, { tagLabel: string; slots: Slot[] }>()
    for (const s of slots) {
      const entry = map.get(s.dateKey)
      if (entry) entry.slots.push(s)
      else map.set(s.dateKey, { tagLabel: s.tagLabel, slots: [s] })
    }
    return Array.from(map.values())
  }, [slots])

  function handleSubmit() {
    if (!selectedIso) return
    setError(null)
    startTransition(async () => {
      const result = await onSubmit(token, selectedIso)
      if (result.ok) {
        setDone(true)
      } else {
        setError(result.error ?? 'Fehler beim Buchen — bitte erneut versuchen.')
      }
    })
  }

  if (done) {
    return (
      <main className="min-h-screen bg-claimondo-bg flex items-center justify-center px-4 py-8">
        <div className="bg-white rounded-2xl border border-claimondo-border p-6 max-w-md w-full text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-claimondo-navy mb-1">Vorschlag gesendet</h1>
          <p className="text-sm text-claimondo-ondo">
            Dein Vorschlag ist beim Sachverständigen eingegangen. Du bekommst eine Bestätigung sobald er den Termin annimmt.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-claimondo-bg px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <header className="mb-5">
          <h1 className="text-xl font-semibold text-claimondo-navy">
            {vorname ? `Hallo ${vorname}, ` : ''}wähle einen neuen Termin
          </h1>
          <p className="text-sm text-claimondo-ondo mt-1">
            Wir konnten dich beim letzten Termin leider nicht antreffen. Such dir hier einen passenden Slot — der Sachverständige bekommt deinen Vorschlag und bestätigt ihn.
          </p>
          {(kennzeichen || schadensOrt) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {kennzeichen && (
                <span className="bg-white border border-claimondo-border rounded-md px-2 py-1 text-claimondo-ondo">
                  Kennzeichen: <span className="font-medium text-claimondo-navy">{kennzeichen}</span>
                </span>
              )}
              {schadensOrt && (
                <span className="bg-white border border-claimondo-border rounded-md px-2 py-1 text-claimondo-ondo">
                  Ort: <span className="font-medium text-claimondo-navy">{schadensOrt}</span>
                </span>
              )}
            </div>
          )}
        </header>

        <section className="space-y-3 mb-24">
          {tageGruppen.map((tag) => (
            <div key={tag.tagLabel} className="bg-white rounded-xl border border-claimondo-border p-3">
              <h2 className="text-sm font-semibold text-claimondo-navy mb-2">{tag.tagLabel}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {tag.slots.map((s) => {
                  const isSelected = selectedIso === s.startIso
                  const base = 'rounded-lg px-3 py-2 text-sm font-medium border transition-colors'
                  const cls = !s.available
                    ? `${base} bg-claimondo-bg text-claimondo-ondo/40 border-claimondo-border line-through cursor-not-allowed`
                    : isSelected
                      ? `${base} bg-claimondo-navy text-white border-claimondo-navy`
                      : `${base} bg-white text-claimondo-navy border-claimondo-border hover:border-claimondo-ondo`
                  return (
                    <button
                      key={s.startIso}
                      type="button"
                      disabled={!s.available || isPending}
                      onClick={() => setSelectedIso(s.startIso)}
                      className={cls}
                      aria-pressed={isSelected}
                    >
                      {s.zeitLabel}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </section>

        {/* Sticky-Bottom-Bar mit Submit */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-claimondo-border p-4 shadow-claimondo-md">
          <div className="max-w-2xl mx-auto">
            {error && (
              <p className="text-sm text-red-600 mb-2">{error}</p>
            )}
            <button
              type="button"
              disabled={!selectedIso || isPending}
              onClick={handleSubmit}
              className="w-full py-3 rounded-lg bg-claimondo-navy text-white text-sm font-semibold disabled:opacity-40"
            >
              {isPending ? 'Sende Vorschlag…' : selectedIso ? 'Termin vorschlagen' : 'Slot wählen'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
