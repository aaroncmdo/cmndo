'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2Icon, AlertCircleIcon, UploadIcon } from 'lucide-react'

type Pflichtdok = {
  id: string
  titel: string
  status: string
  datei_url: string | null
  datei_name: string | null
}

export default function DokumenteSection({
  fallId,
  pflichtdokumente,
  uploadDokument,
}: {
  fallId: string
  pflichtdokumente: Pflichtdok[]
  uploadDokument: (fallId: string, pflichtdokumentId: string, formData: FormData) => Promise<void>
}) {
  const done = pflichtdokumente.filter(d => d.status === 'hochgeladen')
  const missing = pflichtdokumente.filter(d => d.status !== 'hochgeladen')

  if (pflichtdokumente.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Deine Unterlagen</h3>
        <span className="text-xs text-gray-500">{done.length}/{pflichtdokumente.length} hochgeladen</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all"
          style={{ width: `${(done.length / pflichtdokumente.length) * 100}%` }}
        />
      </div>

      {/* Missing docs (red) */}
      {missing.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-red-600 font-medium">{missing.length} Dokument{missing.length > 1 ? 'e' : ''} fehlen noch:</p>
          {missing.map(dok => (
            <DokUploadRow key={dok.id} fallId={fallId} dok={dok} uploadDokument={uploadDokument} />
          ))}
        </div>
      )}

      {/* Uploaded docs (green) */}
      {done.length > 0 && (
        <div className="space-y-1">
          {done.map(dok => (
            <div key={dok.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50">
              <CheckCircle2Icon className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-sm text-green-800 flex-1">{dok.titel}</span>
              <span className="text-[10px] text-green-600">{dok.datei_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DokUploadRow({
  fallId,
  dok,
  uploadDokument,
}: {
  fallId: string
  dok: Pflichtdok
  uploadDokument: (fallId: string, pflichtdokumentId: string, formData: FormData) => Promise<void>
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    startTransition(async () => {
      try {
        await uploadDokument(fallId, dok.id, fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      }
    })
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
      <AlertCircleIcon className="w-4 h-4 text-red-500 shrink-0" />
      <span className="text-sm text-red-800 flex-1">{dok.titel}</span>
      <label className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${pending ? 'bg-gray-200 text-gray-500' : 'bg-red-600 text-white hover:bg-red-700'}`}>
        <UploadIcon className="w-3 h-3" />
        {pending ? 'Lädt...' : 'Hochladen'}
        <input type="file" className="hidden" onChange={handleFile} disabled={pending} accept=".pdf,.jpg,.jpeg,.png" />
      </label>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  )
}
