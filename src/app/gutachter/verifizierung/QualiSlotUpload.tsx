'use client'

// AAR-647: Upload-Button für SV-Pflicht-Slots im Verifizierungs-Tab.
// Ruft uploadSvPflichtdokument() mit dem slotId aus den Props.
// Nach Erfolg: Router-Refresh damit der neue „In Prüfung"-Status angezeigt wird.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UploadIcon, CheckIcon, Loader2Icon } from 'lucide-react'
import { uploadSvPflichtdokument } from '@/lib/actions/sv-verifizierung-actions'

type Props = {
  slotId: string
  // Verstecken/Disablen wenn schon freigegeben
  disabled?: boolean
  label?: string
}

export default function QualiSlotUpload({ slotId, disabled, label = 'Hochladen' }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function pick() {
    setError(null)
    setSuccess(false)
    fileRef.current?.click()
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('slot_id', slotId)
    fd.append('datei', file)
    startTransition(async () => {
      try {
        await uploadSvPflichtdokument(fd)
        setSuccess(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      }
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        onChange={onFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={pick}
        disabled={disabled || pending}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border border-claimondo-ondo text-claimondo-ondo hover:bg-claimondo-ondo/5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? (
          <>
            <Loader2Icon className="w-3 h-3 animate-spin" /> Lädt hoch…
          </>
        ) : success ? (
          <>
            <CheckIcon className="w-3 h-3" /> Hochgeladen
          </>
        ) : (
          <>
            <UploadIcon className="w-3 h-3" /> {label}
          </>
        )}
      </button>
      {error && <span className="text-[10px] text-red-600 max-w-[180px] text-right">{error}</span>}
    </div>
  )
}
