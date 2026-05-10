'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { UploadIcon, XIcon, LoaderIcon, CheckCircleIcon, CloudOffIcon, WifiOffIcon } from 'lucide-react'
import { uploadFallDokument } from '@/lib/dokumente/upload'
import { DOKUMENT_LABELS } from '@/lib/dokumente/pflicht-dokumente'
import { useOnlineStatus } from '@/lib/offline/use-online-status'
import { addToOutbox } from '@/lib/offline/outbox'

// KFZ-172 Phase 2: Dropzone-Komponente fuer Fall-Dokument-Upload.
// KFZ-180: Offline-Fallback — bei kein Internet in Outbox speichern.

export default function FallDokumentDropzone({
  fallId,
  dokumentTyp,
  istPflicht,
  abPhase,
  onClose,
  onSuccess,
}: {
  fallId: string
  dokumentTyp: string
  istPflicht: boolean
  abPhase: string | null
  onClose?: () => void
  onSuccess?: () => void
}) {
  const router = useRouter()
  const isOnline = useOnlineStatus()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [savedOffline, setSavedOffline] = useState(false)

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setError(null)
    setUploading(true)

    // KFZ-180: Offline → Outbox
    if (!navigator.onLine) {
      try {
        await addToOutbox({
          fall_id: fallId,
          dokument_typ: dokumentTyp,
          file_blob: file,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type,
          ist_pflicht: istPflicht,
          ab_phase: abPhase,
        })
        setSavedOffline(true)
        setUploading(false)
        onSuccess?.()
        return
      } catch {
        setError('Lokale Speicherung fehlgeschlagen')
        setUploading(false)
        return
      }
    }

    // Online: normal upload
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadFallDokument(fallId, dokumentTyp, istPflicht, abPhase, fd)
    setUploading(false)

    if (!res.success) {
      // KFZ-180: Upload failed → try Outbox as fallback
      try {
        await addToOutbox({
          fall_id: fallId,
          dokument_typ: dokumentTyp,
          file_blob: file,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type,
          ist_pflicht: istPflicht,
          ab_phase: abPhase,
        })
        setSavedOffline(true)
        onSuccess?.()
      } catch {
        setError(res.error ?? 'Upload fehlgeschlagen')
      }
    } else {
      setDone(true)
      router.refresh()
      onSuccess?.()
      setTimeout(() => onClose?.(), 1200)
    }
  }, [fallId, dokumentTyp, istPflicht, abPhase, router, onClose, onSuccess])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 1,
    disabled: uploading || done || savedOffline,
  })

  const label = DOKUMENT_LABELS[dokumentTyp] ?? dokumentTyp

  return (
    <div className="bg-white rounded-xl border border-claimondo-border p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-claimondo-navy">
          {istPflicht && <span className="text-red-500">*</span>} {label}
        </h4>
        <div className="flex items-center gap-1.5">
          {!isOnline && (
            <span className="flex items-center gap-1 text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              <WifiOffIcon className="w-3 h-3" /> Offline
            </span>
          )}
          {onClose && (
            <button onClick={onClose} className="text-claimondo-ondo/70 hover:text-claimondo-ondo p-0.5">
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {done ? (
        <div className="flex items-center gap-2 text-emerald-600 text-xs py-3">
          <CheckCircleIcon className="w-4 h-4" /> Hochgeladen!
        </div>
      ) : savedOffline ? (
        <div className="flex items-center gap-2 text-amber-600 text-xs py-3">
          <CloudOffIcon className="w-4 h-4" /> Lokal gespeichert — wird hochgeladen sobald online.
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-[#4573A2] bg-[#4573A2]/5' :
            uploading ? 'border-claimondo-border bg-[#f8f9fb]' :
            'border-claimondo-border hover:border-[#4573A2] hover:bg-[#f8f9fb]/50'
          }`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-claimondo-ondo text-xs">
              <LoaderIcon className="w-4 h-4 animate-spin" /> {isOnline ? 'Wird hochgeladen...' : 'Wird lokal gespeichert...'}
            </div>
          ) : (
            <div className="text-xs text-claimondo-ondo">
              <UploadIcon className="w-5 h-5 mx-auto mb-1 text-claimondo-ondo/70" />
              <p>{isOnline ? 'Datei hierher ziehen oder klicken' : 'Datei wird lokal gespeichert (offline)'}</p>
              <p className="text-[10px] text-claimondo-ondo/70 mt-1">JPG, PNG, WebP, PDF — max 10 MB</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-red-600 text-xs mt-2">{error}</p>
      )}
    </div>
  )
}
