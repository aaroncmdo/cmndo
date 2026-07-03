'use client'

// AAR-558 (C9): Client-Component für den Slot-Picker.
// 1-3 Termin-Vorschläge (Datum + Uhrzeit) + Radio ob der Sachverständige
// zur Konfrontation dabei sein soll. Mobile-first (Form steht gestaffelt).

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { PlusIcon, XIcon } from 'lucide-react'
import { submitNachbesichtigungsTermine } from './actions'
import { Button } from '@/components/primitives/Button'
import { SectionCard } from '@/components/shared/SectionCard'

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
  const t = useTranslations('kunde.settings')
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
    if (befuellt.length === 0) return t('nachbesichtigungPicker.validateMin')
    if (konfrontation === null) return t('nachbesichtigungPicker.validateKonfrontation')
    // Duplikate erkennen
    const keys = befuellt.map((s) => `${s.datum}T${s.uhrzeit}`)
    if (new Set(keys).size !== keys.length) return t('nachbesichtigungPicker.validateDuplikat')
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
        toast.success(t('nachbesichtigungPicker.toastSuccess'))
      } else {
        toast.error(result.error ?? t('nachbesichtigungPicker.toastError'))
      }
    })
  }

  return (
    <SectionCard className="rounded-ios-xl shadow-sm" bodyClassName="space-y-5">
      {/* Slot-Liste */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-claimondo-navy">{t('nachbesichtigungPicker.vorschlaegeHeading')}</p>
        {slots.map((s, idx) => (
          <div
            key={idx}
            className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end"
          >
            <div className="flex-1 space-y-1">
              <label className="text-xs text-claimondo-ondo">{t('nachbesichtigungPicker.datumLabel')}</label>
              <input
                type="date"
                min={minDatum}
                value={s.datum}
                onChange={(e) => updateSlot(idx, { datum: e.target.value })}
                className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm focus:border-claimondo-ondo focus:outline-none"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-claimondo-ondo">{t('nachbesichtigungPicker.uhrzeitLabel')}</label>
              <input
                type="time"
                value={s.uhrzeit}
                onChange={(e) => updateSlot(idx, { uhrzeit: e.target.value })}
                className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm focus:border-claimondo-ondo focus:outline-none"
              />
            </div>
            {slots.length > 1 && (
              <button
                type="button"
                onClick={() => removeSlot(idx)}
                className="shrink-0 rounded-ios-md border border-claimondo-border bg-white px-2 py-2 text-claimondo-ondo/70 hover:text-danger hover:border-danger/30"
                aria-label={t('nachbesichtigungPicker.entfernenAria')}
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
            {t('nachbesichtigungPicker.weitererTermin', { count: slots.length, max: 3 })}
          </button>
        )}
      </div>

      {/* Konfrontations-Radio */}
      <div className="space-y-2 pt-3 border-t border-claimondo-border">
        <p className="text-sm font-semibold text-claimondo-navy">
          {t('nachbesichtigungPicker.konfrontationFrage')}
        </p>
        <p className="text-xs text-claimondo-ondo">
          {t('nachbesichtigungPicker.konfrontationErklaerung')}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <label
            className={`flex-1 flex items-center gap-2 rounded-ios-md border px-3 py-2 cursor-pointer transition-colors ${
              konfrontation === true
                ? 'border-claimondo-ondo bg-[var(--brand-secondary-soft)]'
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
            <span className="text-sm text-claimondo-navy">{t('nachbesichtigungPicker.konfrontationJa')}</span>
          </label>
          <label
            className={`flex-1 flex items-center gap-2 rounded-ios-md border px-3 py-2 cursor-pointer transition-colors ${
              konfrontation === false
                ? 'border-claimondo-ondo bg-[var(--brand-secondary-soft)]'
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
            <span className="text-sm text-claimondo-navy">{t('nachbesichtigungPicker.konfrontationNein')}</span>
          </label>
        </div>
      </div>

      <div className="pt-2">
        <Button variant="navy" fullWidth onClick={handleSubmit} loading={pending}>
          {t('nachbesichtigungPicker.submit')}
        </Button>
      </div>
    </SectionCard>
  )
}
