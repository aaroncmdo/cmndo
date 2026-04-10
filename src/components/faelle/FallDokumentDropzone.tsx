'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { UploadIcon, XIcon, LoaderIcon, CheckCircleIcon } from 'lucide-react'
import { uploadFallDokument } from '@/lib/dokumente/upload'
import { DOKUMENT_LABELS } from '@/lib/dokumente/pflicht-dokumente'

// KFZ-172 Phase 2: Dropzone-Komponente fuer Fall-Dokument-Upload.
// Wird inline in der Sidebar oder als Modal gerendert.

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
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setError(null)
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadFallDokument(fallId, dokumentTyp, istPflicht, abPhase, fd)
    setUploading(false)
    if (!res.success) {
      setError(res.error ?? 'Upload fehlgeschlagen')
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
    disabled: uploading || done,
  })

  const label = DOKUMENT_LABELS[dokumentTyp] ?? dokumentTyp

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-700">
          {istPflicht && <span className="text-red-500">*</span>} {label}
        </h4>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-0.5">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {done ? (
        <div className="flex items-center gap-2 text-emerald-600 text-xs py-3">
          <CheckCircleIcon className="w-4 h-4" /> Hochgeladen!
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-[#4573A2] bg-[#4573A2]/5' :
            uploading ? 'border-gray-200 bg-gray-50' :
            'border-gray-300 hover:border-[#4573A2] hover:bg-gray-50/50'
          }`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 text-xs">
              <LoaderIcon className="w-4 h-4 animate-spin" /> Wird hochgeladen...
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              <UploadIcon className="w-5 h-5 mx-auto mb-1 text-gray-400" />
              <p>Datei hierher ziehen oder klicken</p>
              <p className="text-[10px] text-gray-400 mt-1">JPG, PNG, WebP, PDF — max 10 MB</p>
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
