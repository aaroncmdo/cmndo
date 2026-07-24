'use client'

// Zwei-Schritt-Bestaetigung fuer destruktives Entfernen — KEIN 1-Click-Loeschen (Aaron 24.07.).
// Klick 1: "Entfernen" (ghost) -> Klick 2: "Wirklich entfernen?" (danger) neben "Abbrechen".
// Reset nach Erfolg/Abbruch. Generisch (Labels als Props) -> fuer jede destruktive Aktion nutzbar.
import { useState } from 'react'
import { Button } from '@/components/primitives'

export function ConfirmEntfernenButton({
  onConfirm,
  label = 'Entfernen',
  confirmLabel = 'Wirklich entfernen?',
  size = 'sm',
}: {
  onConfirm: () => void | Promise<void>
  label?: string
  confirmLabel?: string
  size?: 'sm' | 'md'
}) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!armed) {
    return (
      <Button variant="ghost" size={size} onClick={() => setArmed(true)}>
        {label}
      </Button>
    )
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button
        variant="danger"
        size={size}
        loading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onConfirm()
          } finally {
            setBusy(false)
            setArmed(false)
          }
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size={size} disabled={busy} onClick={() => setArmed(false)}>
        Abbrechen
      </Button>
    </span>
  )
}
