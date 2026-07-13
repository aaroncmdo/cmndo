'use client'

// AAR-755 (Phase D): aus dem DokumenteTab-Monolithen extrahiert.
// Upload-Box für das Anschlussschreiben (AS). Zeigt im Post-Upload-Fall
// die OCR-Ergebnisse (Sendedatum, Unterschrift erkannt?).

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EyeIcon, FileTextIcon, Loader2Icon, UploadIcon } from 'lucide-react'
// Storage-RLS-Rest: Upload + Anzeige laufen server-seitig. Der Browser kann
// den privaten Bucket 'fall-dokumente' nicht signieren (createSignedUrl ->
// null), und der Service-Client darf nicht in den Browser. Die Action nimmt
// die Datei direkt entgegen (kein URL-Round-Trip), die signierte Ansehen-URL
// wird lazy beim Klick geholt.
import { uploadAnschlussschreiben } from '../../../../app/faelle/[id]/_actions'
import { getAnschlussschreibenUrl } from '@/lib/dokumente/fall-dokumente-urls'
import { StatusBadge } from '@/components/shared/StatusBadge'

export type FallAS = {
  anschlussschreiben_url: string | null
  anschlussschreiben_sendedatum: string | null
  anschlussschreiben_unterschrift: boolean | null
  anschlussschreiben_ocr_am: string | null
}

type Props = {
  fallId: string
  fallAS: FallAS
}

export function AnschlussschreibenUploadBlock({ fallId, fallAS }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [oeffnet, setOeffnet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function handleUpload(file: File) {
    setUploading(true)
    setFehler(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await uploadAnschlussschreiben(fallId, formData)
      if (!r.success) {
        setFehler(r.error ?? 'Upload fehlgeschlagen')
        return
      }
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  // Die signierte URL ist kurzlebig — deshalb erst beim Klick holen, nicht
  // beim Render vorrätig halten.
  async function handleOeffnen() {
    setOeffnet(true)
    setFehler(null)
    try {
      const res = await getAnschlussschreibenUrl(fallId)
      if (!res.ok) {
        setFehler(res.error)
        return
      }
      window.open(res.url, '_blank', 'noopener,noreferrer')
    } finally {
      setOeffnet(false)
    }
  }

  const hasAS = !!fallAS.anschlussschreiben_url

  return (
    <div
      className={`rounded-ios-xl border p-4 ${
        hasAS ? 'bg-success-soft border-success/30' : 'bg-warning-soft border-warning/30'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
          <FileTextIcon className="w-4 h-4" /> Anschlussschreiben
        </h3>
        {hasAS ? (
          <StatusBadge tone="success">Hochgeladen + OCR</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Ausstehend</StatusBadge>
        )}
      </div>

      {hasAS ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-claimondo-ondo">Sendedatum (OCR)</span>
              <p className="text-claimondo-navy font-medium">
                {fallAS.anschlussschreiben_sendedatum
                  ? new Date(fallAS.anschlussschreiben_sendedatum).toLocaleDateString('de-DE')
                  : 'Nicht erkannt'}
              </p>
            </div>
            <div>
              <span className="text-claimondo-ondo">Unterschrift</span>
              <p
                className={`font-medium ${
                  fallAS.anschlussschreiben_unterschrift ? 'text-success' : 'text-warning'
                }`}
              >
                {fallAS.anschlussschreiben_unterschrift ? 'Erkannt' : 'Nicht erkannt'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOeffnen}
            disabled={oeffnet}
            className="inline-flex items-center gap-1 text-xs text-claimondo-ondo hover:text-claimondo-navy disabled:opacity-50"
          >
            {oeffnet ? (
              <Loader2Icon className="w-3 h-3 animate-spin" />
            ) : (
              <EyeIcon className="w-3 h-3" />
            )}
            Dokument ansehen
          </button>
          {fehler && <p className="text-body-xs text-danger-strong">{fehler}</p>}
        </div>
      ) : (
        <div>
          <input
            ref={fileRef}
            type="file"
            // PDF-only, konsistent zu Button-Label, zum hartkodierten
            // mime_type='application/pdf' im fall_dokumente-Insert und zur
            // pdf-parse-OCR. Vorher liess der Picker `image/*` zu — ein Bild
            // wurde dann als PDF fehletikettiert und die OCR schlug still fehl.
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleUpload(f)
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-white hover:bg-claimondo-bg border border-claimondo-border text-claimondo-navy text-xs font-medium px-3 py-2 rounded-ios-lg transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UploadIcon className="w-3.5 h-3.5" />
            )}
            {uploading ? 'Hochladen + OCR…' : 'AS hochladen (PDF)'}
          </button>
          <p className="text-[10px] text-claimondo-ondo mt-1">
            OCR extrahiert automatisch Sendedatum und Unterschrift
          </p>
          {fehler && <p className="text-body-xs text-danger-strong mt-1">{fehler}</p>}
        </div>
      )}
    </div>
  )
}
