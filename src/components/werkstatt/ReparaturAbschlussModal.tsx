'use client'

// WS6 Slice 1 — Modal: Werkstatt lädt die Schlussrechnung hoch + schließt die Reparatur ab.
// Muster: KvaHochladenModal — nutzt Modal-Primitive statt hand-gerolltem Overlay.
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button, Modal } from '@/components/primitives'
import { markiereReparaturErledigt } from '@/app/werkstatt/(shell)/auftraege/reparatur-abschluss-actions'

export function ReparaturAbschlussModal({
  terminId,
  open,
  onClose,
}: {
  terminId: string
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClose() {
    if (pending) return
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
    onClose()
  }

  function handleSubmit() {
    const file = inputRef.current?.files?.[0]
    if (!file) {
      setError('Bitte die Schlussrechnung auswählen.')
      return
    }
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.append('schlussrechnung', file)
      const res = await markiereReparaturErledigt(terminId, fd)
      if (!res.ok) {
        setError(res.error ?? 'Abschluss fehlgeschlagen')
        toast.error(res.error ?? 'Abschluss fehlgeschlagen')
        return
      }
      toast.success('Reparatur abgeschlossen — der Kunde bekommt seinen Beleg.')
      handleClose()
      router.refresh()
    })
  }

  return (
    <Modal open={open} onClose={handleClose} ariaLabel="Reparatur abschließen" maxWidth={480}>
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-heading-sm text-claimondo-navy font-semibold">Reparatur abschließen</h2>
          <p className="text-body-sm text-claimondo-ondo">
            Lade die Schlussrechnung hoch. Damit gilt die Reparatur als abgeschlossen und der
            Kunde kann den Beleg herunterladen.
          </p>
        </div>
        <div className="space-y-1">
          <label htmlFor="reparatur-abschluss-datei" className="text-body-xs font-medium text-claimondo-navy">
            Schlussrechnung (PDF oder Bild)
          </label>
          <input
            ref={inputRef}
            id="reparatur-abschluss-datei"
            type="file"
            accept="image/*,application/pdf"
            disabled={pending}
            className="block w-full text-body-sm text-claimondo-navy file:mr-3 file:rounded-ios-md file:border-0 file:bg-claimondo-bg file:px-3 file:py-1.5 disabled:opacity-50"
          />
        </div>
        {error && (
          <p className="text-body-xs text-danger-strong bg-danger-soft rounded-ios-lg p-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" disabled={pending} onClick={handleClose}>
            Abbrechen
          </Button>
          <Button variant="navy" size="sm" loading={pending} onClick={handleSubmit}>
            Reparatur abschließen
          </Button>
        </div>
      </div>
    </Modal>
  )
}
