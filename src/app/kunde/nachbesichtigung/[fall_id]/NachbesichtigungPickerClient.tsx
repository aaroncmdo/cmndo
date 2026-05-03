'use client'

// AAR-558 (C9): Client-Component für den Slot-Picker.
// 1-3 Termin-Vorschläge (Datum + Uhrzeit) + Radio ob der Sachverständige
// zur Konfrontation dabei sein soll. Mobile-first (Form steht gestaffelt).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { PlusIcon, XIcon } from 'lucide-react'
import { submitNachbesichtigungsTermine } from './actions'

interface Slot {
  datum: string
  uhrzeit: string
}

interface Props {
  fallId: string
  initialKonfrontation: boolean | null
}

function heuteIso(): string {
  const d = new Date()
  // Pufferday +1 damit der Kunde nicht aus Versehen heute auswählt
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function NachbesichtigungPickerClient({ fallId, initialKonfrontation }: Props) {
  const [slots, setSlots] = useState<Slot[]>([{ datum: '', uhrzeit: '' }])
  const [konfrontation, setKonfrontation] = useState<boolean | null>(initialKonfrontation)
  const [pending, startTransition] = useTransition()

  const minDatum = heuteIso()

  function addSlot() {
    if (slots.length >= 3) return
    setSlots((prev) => [...prev, { datum: '', uhrzeit: '' }])
  }

  function removeSlot(idx: number) {
    if (slots.length <= 1) return
    setSlots((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateSlot(idx: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function validate(): string | null {
    const befuellt = slots.filter((s) => s.datum && s.uhrzeit)
    if (befuellt.length === 0) return 'Mindestens 1 Termin mit Datum und Uhrzeit'
    if (konfrontation === null) return 'Bitte wählen, ob der Sachverständige dabei sein soll'
    // Duplikate erkennen
    const keys = befuellt.map((s) => `${s.datum}T${s.uhrzeit}`)
    if (new Set(keys).size !== keys.length) return 'Termine dürfen nicht doppelt sein'
    return null
  }

  function handleSubmit() {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    const befuellt = slots.filter((s) => s.datum && s.uhrzeit)

    startTransition(async () => {
      const result = await submitNachbesichtigungsTermine({
        fallId,
        termine: befuellt,
        svKonfrontationGewuenscht: konfrontation === true,
      })
      if (result.success) {
        toast.success('Termine eingereicht — wir melden uns bei Fortschritt.')
      } else {
        toast.error(result.error ?? 'Einreichen fehlgeschlagen')
      }
    })
  }

  return (
    <div className="bg-white rounded-xl border border-claimondo-border shadow-sm p-5 space-y-5">
      {/* Slot-Liste */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-claimondo-navy">Ihre Termin-Vorschläge</p>
        {slots.map((s, idx) => (
          <div
            key={idx}
            className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end"
          >
            <div className="flex-1 space-y-1">
              <label className="text-xs text-claimondo-ondo">Datum</label>
              <input
                type="date"
                min={minDatum}
                value={s.datum}
                onChange={(e) => updateSlot(idx, { datum: e.target.value })}
                className="w-full rounded-md border border-claimondo-border bg-white px-3 py-2 text-sm focus:border-claimondo-ondo focus:outline-none"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-claimondo-ondo">Uhrzeit</label>
              <input
                type="time"
                value={s.uhrzeit}
                onChange={(e) => updateSlot(idx, { uhrzeit: e.target.value })}
                className="w-full rounded-md border border-claimondo-border bg-white px-3 py-2 text-sm focus:border-claimondo-ondo focus:outline-none"
              />
            </div>
            {slots.length > 1 && (
              <button
                type="button"
                onClick={() => removeSlot(idx)}
                className="shrink-0 rounded-md border border-claimondo-border bg-white px-2 py-2 text-claimondo-ondo/70 hover:text-red-600 hover:border-red-200"
                aria-label="Termin entfernen"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}

        {slots.length < 3 && (
          <button
            type="button"
            onClick={addSlot}
            className="inline-flex items-center gap-1.5 text-xs text-claimondo-ondo hover:text-claimondo-navy"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Weiteren Termin vorschlagen ({slots.length}/3)
          </button>
        )}
      </div>

      {/* Konfrontations-Radio */}
      <div className="space-y-2 pt-3 border-t border-claimondo-border">
        <p className="text-sm font-semibold text-claimondo-navy">
          Soll unser Sachverständiger mit vor Ort sein?
        </p>
        <p className="text-xs text-claimondo-ondo">
          Bei einer Konfrontation ist unser Sachverständiger gleichzeitig vor Ort wie der der
          Versicherung. Das ist kostenlos für Sie.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <label
            className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
              konfrontation === true
                ? 'border-claimondo-ondo bg-[#EBF1F8]'
                : 'border-claimondo-border hover:border-claimondo-ondo/60'
            }`}
          >
            <input
              type="radio"
              name="konfrontation"
              checked={konfrontation === true}
              onChange={() => setKonfrontation(true)}
              className="accent-claimondo-ondo"
            />
            <span className="text-sm text-claimondo-navy">Ja, bitte mit Konfrontation</span>
          </label>
          <label
            className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
              konfrontation === false
                ? 'border-claimondo-ondo bg-[#EBF1F8]'
                : 'border-claimondo-border hover:border-claimondo-ondo/60'
            }`}
          >
            <input
              type="radio"
              name="konfrontation"
              checked={konfrontation === false}
              onChange={() => setKonfrontation(false)}
              className="accent-claimondo-ondo"
            />
            <span className="text-sm text-claimondo-navy">Nein, nur der VS-Gutachter</span>
          </label>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="w-full rounded-md bg-claimondo-navy text-white px-3 py-2.5 text-sm font-medium hover:bg-[#162857] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Wird eingereicht …' : 'Termine einreichen'}
        </button>
      </div>
    </div>
  )
}
