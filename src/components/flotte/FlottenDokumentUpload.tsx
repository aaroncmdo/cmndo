'use client'

// Upload-Widget im Schaden-Cockpit des Flottenmanagers: Datei waehlen -> Server-Action.
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'

export function FlottenDokumentUpload({
  vehicleId,
  claimId,
  onUpload,
}: {
  vehicleId: string
  claimId: string
  onUpload: (
    vehicleId: string,
    claimId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [dateiName, setDateiName] = useState<string | null>(null)

  async function hochladen() {
    const file = inputRef.current?.files?.[0]
    if (!file) {
      setFehler('Bitte eine Datei auswählen.')
      return
    }
    setBusy(true)
    setFehler(null)
    const fd = new FormData()
    fd.set('file', file)
    const res = await onUpload(vehicleId, claimId, fd)
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Upload fehlgeschlagen.')
      return
    }
    setDateiName(null)
    if (inputRef.current) inputRef.current.value = ''
    router.refresh()
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-claimondo-border/60 pt-3">
      <input
        ref={inputRef}
        type="file"
        onChange={(e) => setDateiName(e.target.files?.[0]?.name ?? null)}
        className="min-w-0 flex-1 text-body-xs text-claimondo-ondo file:mr-2 file:rounded-ios-sm file:border-0 file:bg-claimondo-bg file:px-3 file:py-1.5 file:text-claimondo-navy"
      />
      <Button variant="ondo" size="sm" onClick={hochladen} loading={busy} disabled={!dateiName || busy}>
        Hochladen
      </Button>
      {fehler ? <p className="w-full text-caption text-danger-strong">{fehler}</p> : null}
    </div>
  )
}
