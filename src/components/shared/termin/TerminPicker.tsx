'use client'

// AAR-900: Shared-Component fuer Termin-Slot-Auswahl. Wird konsumiert von
// /kunde/re-termin/[token], /kunde/onboarding (Step Termin) und perspektivisch
// /kunde/faelle/[id] (Verlegen-Drawer).
//
// Liefert KEINE Navigation — der Caller entscheidet was nach onBooked
// passiert (Toast, Step weiter, Redirect). Slot-Grid kommt vom Caller als
// Server-rendered Prop (siehe src/lib/termine/slot-grid.ts).
//
// Design-Tokens: claimondo-bg, claimondo-navy, claimondo-ondo,
// claimondo-border, rounded-ios-sm/md, shadow-claimondo-sm.

import { useMemo, useState, useTransition } from 'react'
import { groupSlotsByDay, type TerminSlot } from '@/lib/termine/slot-grid'

export type TerminPickerMode = 'erstbuchung' | 'verlegung'

export type TerminPickerProps = {
  slots: TerminSlot[]
  mode: TerminPickerMode
  /** Aktueller Termin (nur bei mode='verlegung') — zur Anzeige. */
  currentTerminLabel?: string | null
  /** Optionale Header-Daten zur Vergewisserung des Kunden. */
  kontext?: {
    vorname?: string | null
    kennzeichen?: string | null
    schadensOrt?: string | null
  }
  /** Submit-Handler. Caller entscheidet zwischen bucheNeuenTermin /
   *  verlegeTermin / waehleReTerminSlot. Bekommt den ISO-Start des
   *  ausgewaehlten Slots. */
  onBooked: (slotStartIso: string) => Promise<{ ok: boolean; error?: string }>
  /** Optional: Inhalt der Success-Card. Default je nach mode. */
  successHeading?: string
  successText?: string
}

export function TerminPicker({
  slots,
  mode,
  currentTerminLabel,
  kontext,
  onBooked,
  successHeading,
  successText,
}: TerminPickerProps) {
  const [selectedIso, setSelectedIso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  const gruppen = useMemo(() => groupSlotsByDay(slots), [slots])

  function handleSubmit() {
    if (!selectedIso) return
    setError(null)
    startTransition(async () => {
      const result = await onBooked(selectedIso)
      if (result.ok) {
        setDone(true)
      } else {
        setError(result.error ?? 'Fehler beim Buchen — bitte erneut versuchen.')
      }
    })
  }

  if (done) {
    const defaultHeading =
      mode === 'verlegung' ? 'Vorschlag gesendet' : 'Termin gebucht'
    const defaultText =
      mode === 'verlegung'
        ? 'Dein Vorschlag ist beim Sachverständigen eingegangen. Du bekommst eine Bestätigung sobald er den Termin annimmt.'
        : 'Dein Termin ist verbindlich reserviert. Wir senden dir eine Bestätigung per Email und WhatsApp.'
    return (
      <div className="rounded-ios-md border border-claimondo-border bg-white p-6 text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-claimondo-navy">
          {successHeading ?? defaultHeading}
        </h2>
        <p className="mt-1 text-sm text-claimondo-ondo">
          {successText ?? defaultText}
        </p>
      </div>
    )
  }

  const heading =
    mode === 'verlegung'
      ? `${kontext?.vorname ? `Hallo ${kontext.vorname}, ` : ''}wähle einen neuen Termin`
      : `${kontext?.vorname ? `Hallo ${kontext.vorname}, ` : ''}wähle deinen SV-Termin`
  const subtext =
    mode === 'verlegung'
      ? 'Wir senden deinen Vorschlag an den Sachverständigen — er bestätigt ihn meist innerhalb von Stunden.'
      : 'Wähle eine Wunschzeit. Du kannst den Termin später jederzeit verlegen.'

  return (
    <div>
      <header className="mb-5">
        <h2 className="text-xl font-semibold text-claimondo-navy">{heading}</h2>
        <p className="mt-1 text-sm text-claimondo-ondo">{subtext}</p>

        {currentTerminLabel ? (
          <div className="mt-3 rounded-ios-sm border border-claimondo-border bg-claimondo-bg p-3 text-xs text-claimondo-ondo">
            Bisheriger Termin:{' '}
            <span className="font-medium text-claimondo-navy">{currentTerminLabel}</span>
          </div>
        ) : null}

        {(kontext?.kennzeichen || kontext?.schadensOrt) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {kontext?.kennzeichen && (
              <span className="rounded-md border border-claimondo-border bg-white px-2 py-1 text-claimondo-ondo">
                Kennzeichen:{' '}
                <span className="font-medium text-claimondo-navy">{kontext.kennzeichen}</span>
              </span>
            )}
            {kontext?.schadensOrt && (
              <span className="rounded-md border border-claimondo-border bg-white px-2 py-1 text-claimondo-ondo">
                Ort:{' '}
                <span className="font-medium text-claimondo-navy">{kontext.schadensOrt}</span>
              </span>
            )}
          </div>
        )}
      </header>

      <section className="mb-6 space-y-3">
        {gruppen.map((tag) => (
          <div
            key={tag.dateKey}
            className="rounded-ios-md border border-claimondo-border bg-white p-3"
          >
            <div className="mb-2 text-sm font-semibold text-claimondo-navy">
              {tag.tagLabel}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tag.slots.map((s) => {
                const isSelected = selectedIso === s.startIso
                const disabled = !s.available
                return (
                  <button
                    key={s.startIso}
                    type="button"
                    onClick={() => !disabled && setSelectedIso(s.startIso)}
                    disabled={disabled}
                    aria-pressed={isSelected}
                    className={[
                      'rounded-ios-sm border px-3 py-2.5 text-sm font-medium transition',
                      isSelected
                        ? 'border-claimondo-ondo bg-claimondo-ondo text-white shadow-claimondo-sm'
                        : disabled
                          ? 'border-claimondo-border bg-claimondo-bg text-claimondo-ondo/40 line-through cursor-not-allowed'
                          : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo',
                    ].join(' ')}
                  >
                    {s.zeitLabel}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-ios-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!selectedIso || isPending}
        className="w-full inline-flex items-center justify-center min-h-12 px-6 py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm tracking-[-.01em] shadow-claimondo-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {isPending
          ? 'Wird gespeichert …'
          : mode === 'verlegung'
            ? 'Termin vorschlagen'
            : 'Termin verbindlich buchen'}
      </button>
    </div>
  )
}
