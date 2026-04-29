'use client'

// CMM-32: Drag & Drop / Multi-File-Upload-Banner für das Gutachten +
// Anhänge. Erscheint auf der SV-Fallseite wenn der Termin durchgeführt ist
// und das Gutachten noch nicht hochgeladen wurde. Erste hochgeladene PDF
// gilt als Hauptgutachten — alle weiteren als Anlagen.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloudIcon, FileTextIcon, CheckIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  auftragId: string
  claimId: string
  hatGutachten: boolean
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'
type UploadFile = { name: string; status: UploadStatus; error?: string; istHaupt: boolean }

export default function GutachtenUploadBanner({ auftragId, claimId, hatGutachten }: Props) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()

  if (hatGutachten && files.length === 0) {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
        <CheckIcon className="w-4 h-4 shrink-0 text-emerald-700" />
        <span className="text-sm font-medium text-emerald-800">Gutachten hochgeladen — QC läuft.</span>
      </div>
    )
  }

  async function uploadEine(file: File, istHaupt: boolean): Promise<{ ok: boolean; error?: string }> {
    const supabase = createClient()
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
    // CMM-32: Storage am Claim verankern, Auftrag-Bezug bleibt im Pfad
    const storagePath = `claim/${claimId}/gutachten/${auftragId}/${Date.now()}-${safeName}`
    // Direktupload — kein API-Body, umgeht Vercel-413-Limit
    const { error: upErr } = await supabase.storage
      .from('fall-dokumente')
      .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (upErr) return { ok: false, error: upErr.message }

    // Metadaten + Auftrag-Update via Finalize-API
    const res = await fetch('/api/sv/upload-gutachten/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auftragId,
        storagePath,
        filename: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        istHauptgutachten: istHaupt,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return { ok: false, error: (j as { error?: string }).error ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  }

  function handleFiles(filesIn: FileList | File[]) {
    const arr = Array.from(filesIn)
    if (!arr.length) return
    const istErsterPDF = !hatGutachten && files.length === 0
    const initial: UploadFile[] = arr.map((f, i) => ({
      name: f.name,
      status: 'uploading' as UploadStatus,
      istHaupt: istErsterPDF && i === 0 && f.type === 'application/pdf',
    }))
    setFiles((s) => [...s, ...initial])

    startTransition(async () => {
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i]
        const istHaupt = istErsterPDF && i === 0 && file.type === 'application/pdf'
        const r = await uploadEine(file, istHaupt)
        setFiles((s) =>
          s.map((f) =>
            f.name === file.name && f.status === 'uploading'
              ? { ...f, status: r.ok ? 'done' : 'error', error: r.error }
              : f,
          ),
        )
      }
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl bg-amber-50 border-2 border-dashed border-amber-300 px-4 py-5 space-y-3">
      <div className="flex items-start gap-3">
        <FileTextIcon className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">Gutachten hochladen</p>
          <p className="text-xs text-amber-800 mt-0.5">
            Lade hier dein Gutachten + zugehörige Fotos und Dokumente hoch. Die erste PDF gilt als Hauptgutachten und startet den QC-Prozess.
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-xl border border-dashed cursor-pointer transition-colors px-4 py-6 text-center ${
          dragOver ? 'bg-amber-100 border-amber-400' : 'bg-white border-amber-300 hover:bg-amber-50'
        }`}
      >
        <UploadCloudIcon className="w-6 h-6 mx-auto text-amber-600 mb-2" />
        <p className="text-sm font-medium text-amber-900">
          Dateien hierher ziehen oder klicken zum Auswählen
        </p>
        <p className="text-xs text-amber-700 mt-1">PDF, JPG, PNG · Mehrere Dateien möglich</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  f.status === 'done'
                    ? 'bg-emerald-500'
                    : f.status === 'error'
                      ? 'bg-red-500'
                      : 'bg-amber-500 animate-pulse'
                }`}
              />
              <span className="font-medium text-claimondo-navy truncate flex-1">{f.name}</span>
              {f.istHaupt && (
                <span className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Hauptgutachten</span>
              )}
              {f.status === 'error' && <span className="text-red-700">{f.error ?? 'Fehler'}</span>}
              {f.status === 'done' && <CheckIcon className="w-3 h-3 text-emerald-600" />}
            </li>
          ))}
        </ul>
      )}

      {pending && <p className="text-xs text-amber-700">Wird hochgeladen…</p>}
    </div>
  )
}
