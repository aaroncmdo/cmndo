// AAR-448: Reschedule-Modal für Kunden-Termine.
// Pragmatischer MVP-Flow: Kunde nennt Wunsch-Zeitraum, Task landet beim KB.
// Kein direkter SV-Kalender-Zugriff — KB koordiniert manuell.

'use client'

import { useState, useTransition } from 'react'
import { Modal } from '@/components/primitives/Modal'

type Props = {
  open: boolean
  onClose: () => void
  terminId: string
  terminTyp: 'sv_begutachtung' | 'kb_beratung'
  onSuccess?: () => void
}

export default function TerminReschedulingModal({
  open,
  onClose,
  terminId,
  terminTyp,
  onSuccess,
}: Props) {
  const [wunsch, setWunsch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/kunde/termin/verschieben', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ termin_id: terminId, wunsch_zeitraum: wunsch || null }),
        })
        const json = await res.json()
        if (!res.ok || !json?.success) {
          setError(json?.error ?? 'Fehler beim Senden der Anfrage.')
          return
        }
        setSuccess(true)
        onSuccess?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Netzwerkfehler')
      }
    })
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={448} ariaLabel="Termin verschieben">
      <h2
          id="reschedule-title"
          className="text-base font-semibold"
          style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
        >
          Termin verschieben
        </h2>
        <p
          className="text-xs mt-1"
          style={{ color: 'var(--brand-text-secondary, #6b7280)' }}
        >
          {terminTyp === 'kb_beratung'
            ? 'Ihr Betreuer meldet sich binnen 24 Stunden mit einem neuen Vorschlag.'
            : 'Ihr Gutachter-Koordinator meldet sich binnen 24 Stunden mit neuen Slots.'}
        </p>

        {!success ? (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <label className="block">
              <span
                className="text-xs font-medium"
                style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
              >
                Ihr Wunsch-Zeitraum (optional)
              </span>
              <textarea
                value={wunsch}
                onChange={(e) => setWunsch(e.target.value)}
                placeholder={'z. B. „nächste Woche vormittags" oder „ab 21.04. nach 15 Uhr"'}
                // AAR-452: text-base verhindert iOS-Autozoom
                className="mt-1 w-full rounded-ios-md border px-3 py-2 text-base min-h-[80px]"
                style={{
                  borderColor: 'var(--brand-border, #e5e7eb)',
                  background: 'var(--brand-surface, #ffffff)',
                  color: 'var(--brand-text-primary, #0D1B3E)',
                }}
                maxLength={500}
              />
            </label>

            {error && (
              <p
                className="text-xs"
                style={{ color: 'var(--brand-danger, #dc2626)' }}
              >
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="rounded-ios-md border px-4 min-h-[44px] text-sm"
                style={{
                  borderColor: 'var(--brand-border, #e5e7eb)',
                  color: 'var(--brand-text-secondary, #4b5563)',
                }}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-ios-md px-4 min-h-[44px] text-sm font-medium disabled:opacity-60"
                style={{
                  background: 'var(--brand-primary, #0D1B3E)',
                  color: 'var(--brand-text-on-primary, #ffffff)',
                }}
              >
                {pending ? 'Wird gesendet…' : 'Anfrage senden'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-3">
            <p
              className="text-sm"
              style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
            >
              Ihre Anfrage wurde weitergeleitet. Ihr Betreuer meldet sich in
              Kürze bei Ihnen.
            </p>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-ios-md px-4 min-h-[44px] text-sm font-medium"
                style={{
                  background: 'var(--brand-primary, #0D1B3E)',
                  color: 'var(--brand-text-on-primary, #ffffff)',
                }}
              >
                Schließen
              </button>
            </div>
          </div>
        )}
    </Modal>
  )
}
