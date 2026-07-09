'use client'

// WS3 (Reduced-Repair) — Schadenfotos-Upload-Card fuer die reparatur-only Fallakte.
// Im reduzierten Flow nimmt kein SV Fotos auf -> der Kunde liefert sie hier.
// Zeigt die bereits hochgeladenen Fotos als Thumbnail-Grid + einen Multi-Upload.
// Die Fotos sind fuer die vermittelte Werkstatt sichtbar (sichtbar_fuer).

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CameraIcon, UploadIcon, Loader2Icon } from 'lucide-react'

import { Card } from '@/components/primitives'
import { uploadSchadensfotoKunde } from '@/app/kunde/faelle/[id]/schadensfoto-actions'

export type SchadensfotoUploadCardProps = {
  claimId: string
  fotos: { url: string }[]
}

export default function SchadensfotoUploadCard({ claimId, fotos }: SchadensfotoUploadCardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      for (const f of files) fd.append('files', f)
      const res = await uploadSchadensfotoKunde(claimId, fd)
      if (inputRef.current) inputRef.current.value = ''
      if (!res.ok) {
        setError(res.error ?? 'Upload fehlgeschlagen')
        toast.error(res.error ?? 'Upload fehlgeschlagen')
        return
      }
      toast.success('Fotos hochgeladen.')
      router.refresh()
    })
  }

  return (
    <Card>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <CameraIcon className="w-5 h-5 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">Schadenfotos</h2>
        </div>

        <p className="text-body-sm text-claimondo-ondo">
          Lade Fotos vom Schaden hoch, damit die Werkstatt sieht, was zu reparieren ist. Am besten
          Gesamtansicht, Nahaufnahme des Schadens und angrenzende Teile.
        </p>

        {/* Thumbnail-Grid */}
        {fotos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {fotos.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a
                key={`${f.url}-${i}`}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square overflow-hidden rounded-ios-lg border border-claimondo-border bg-claimondo-bg"
              >
                <img src={f.url} alt={`Schadenfoto ${i + 1}`} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}

        {/* Multi-Upload */}
        <label
          className={`flex items-center justify-center gap-2 w-full min-h-11 rounded-ios-xl border-2 border-dashed border-claimondo-border hover:border-claimondo-ondo bg-claimondo-bg hover:bg-white text-sm font-medium text-claimondo-navy cursor-pointer transition-colors ${
            pending ? 'opacity-60 pointer-events-none' : ''
          }`}
        >
          {pending ? (
            <>
              <Loader2Icon className="w-4 h-4 animate-spin" /> Lädt hoch …
            </>
          ) : (
            <>
              <UploadIcon className="w-4 h-4" /> {fotos.length > 0 ? 'Weitere Fotos hochladen' : 'Fotos hochladen'}
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            disabled={pending}
            onChange={handleFilesSelected}
          />
        </label>

        {error && (
          <p className="text-xs text-danger-strong bg-danger-soft border border-danger/30 rounded-ios-lg p-2">
            {error}
          </p>
        )}
      </div>
    </Card>
  )
}
