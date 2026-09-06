'use client'

// Slice 1b — Modal: SV laedt seine Honorar-/Gutachten-Rechnung hoch.
// Muster: ReparaturAbschlussModal (Modal-Primitive + Button-Primitive).
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button, Modal } from '@/components/primitives'
import { uploadSvRechnung } from '../_actions/sv-rechnung-upload'

export function SvRechnungUploadModal({
  fallId,
  open,
  onClose,
}: {
  fallId: string
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
      setError('Bitte die Rechnung auswählen.')
      return
    }
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.append('rechnung', file)
      const res = await uploadSvRechnung(fallId, fd)
      if (!res.ok) {
        setError(res.error ?? 'Upload fehlgeschlagen')
        toast.error(res.error ?? 'Upload fehlgeschlagen')
        return
      }
      toast.success('Rechnung hochgeladen — der Kunde kann sie jetzt herunterladen.')
      handleClose()
      router.refresh()
    })
  }

  return (
    <Modal open={open} onClose={handleClose} ariaLabel="Rechnung hochladen" maxWidth={480}>
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-heading-sm text-claimondo-navy font-semibold">Rechnung hochladen</h2>
          <p className="text-body-sm text-claimondo-ondo">
            Laden Sie Ihre Honorar- oder Gutachten-Rechnung hoch (PDF oder Bild, max. 10 MB). Der
            Kunde kann sie anschließend in seiner Fallakte herunterladen.
          </p>
        </div>
        <div className="space-y-1">
          <label htmlFor="sv-rechnung-datei" className="text-body-xs font-medium text-claimondo-navy">
            Rechnung (PDF oder Bild)
          </label>
          <input
            ref={inputRef}
            id="sv-rechnung-datei"
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
            Rechnung hochladen
          </Button>
        </div>
      </div>
    </Modal>
  )
}
