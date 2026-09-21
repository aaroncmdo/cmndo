'use client'

// Upload + Unterschriftsfeld in einem Stück — für die vier Unterlagen, die der Kunde
// mit-signiert (Sicherungsabtretung, Honorarvereinbarung, Datenschutz, Widerruf).
//
// Aaron 20.09.2026: „ja aber das Unterschriftsfeld muss gesetzt werden." Beides gehört in
// dieselbe Komponente, damit sich der Editor direkt nach dem Upload öffnet — sonst lädt ein
// Gutachter seine Sicherungsabtretung hoch, sieht einen Haken und merkt nie, dass sie ohne
// gesetztes Feld gar nicht zum Kunden geht.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UploadIcon, Loader2Icon } from 'lucide-react'
import { uploadSvPflichtdokument } from '@/lib/actions/sv-verifizierung-actions'
import { SvUnterschriftsfeldKnopf } from '@/components/sv/UnterschriftsfeldKnopf'

export default function KundenUnterlageAktion({
  slotId,
  label,
  dateiDa,
  feldGesetzt,
  bestandOhneFeld,
}: {
  slotId: string
  label: string
  dateiDa: boolean
  feldGesetzt: boolean
  bestandOhneFeld: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [frisch, setFrisch] = useState(0)
  const [lokalDateiDa, setLokalDateiDa] = useState(dateiDa)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const fd = new FormData()
    fd.append('slot_id', slotId)
    fd.append('datei', file)
    startTransition(async () => {
      const result = await uploadSvPflichtdokument(fd)
      if (result.ok) {
        setLokalDateiDa(true)
        setFrisch((n) => n + 1)
      } else {
        setError(result.error)
      }
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" onChange={onFile} className="hidden" />
      <button
        type="button"
        onClick={() => {
          setError(null)
          fileRef.current?.click()
        }}
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-ios-lg border border-claimondo-ondo text-claimondo-ondo hover:bg-claimondo-ondo/5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? (
          <>
            <Loader2Icon className="w-3 h-3 animate-spin" /> Lädt hoch…
          </>
        ) : (
          <>
            <UploadIcon className="w-3 h-3" /> {lokalDateiDa ? 'Neu hochladen' : 'Hochladen'}
          </>
        )}
      </button>

      {lokalDateiDa && (
        <SvUnterschriftsfeldKnopf
          key={`${slotId}-${frisch}`}
          slotId={slotId}
          slotLabel={label}
          gesetzt={frisch === 0 && feldGesetzt}
          bestandOhneFeld={frisch === 0 && bestandOhneFeld}
          sofortOeffnen={frisch > 0}
          kompakt
          onGespeichert={() => router.refresh()}
        />
      )}

      {error && <span className="text-[10px] text-danger max-w-[260px] text-right leading-snug">{error}</span>}
    </div>
  )
}
