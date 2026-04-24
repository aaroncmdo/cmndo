'use client'

// AAR-755 (Phase D): aus dem DokumenteTab-Monolithen extrahiert.
// Upload-Box für das Anschlussschreiben (AS). Zeigt im Post-Upload-Fall
// die OCR-Ergebnisse (Sendedatum, Unterschrift erkannt?).

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EyeIcon, FileTextIcon, Loader2Icon, UploadIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadAnschlussschreiben } from '../../../../app/faelle/[id]/_actions'

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

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'pdf'
      const path = `faelle/${fallId}/anschlussschreiben_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('fall-dokumente').upload(path, file)
      if (upErr) {
        setUploading(false)
        return
      }
      const { data: urlData } = supabase.storage.from('fall-dokumente').getPublicUrl(path)
      await uploadAnschlussschreiben(fallId, urlData.publicUrl, file.name)
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  const hasAS = !!fallAS.anschlussschreiben_url

  return (
    <div
      className={`rounded-xl border p-4 ${
        hasAS ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
          <FileTextIcon className="w-4 h-4" /> Anschlussschreiben
        </h3>
        {hasAS ? (
          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
            Hochgeladen + OCR
          </span>
        ) : (
          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
            Ausstehend
          </span>
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
                  fallAS.anschlussschreiben_unterschrift ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {fallAS.anschlussschreiben_unterschrift ? 'Erkannt' : 'Nicht erkannt'}
              </p>
            </div>
          </div>
          <a
            href={fallAS.anschlussschreiben_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-claimondo-ondo hover:text-claimondo-navy"
          >
            <EyeIcon className="w-3 h-3" /> Dokument ansehen
          </a>
        </div>
      ) : (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleUpload(f)
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-white hover:bg-[#f8f9fb] border border-claimondo-border text-claimondo-navy text-xs font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
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
        </div>
      )}
    </div>
  )
}
