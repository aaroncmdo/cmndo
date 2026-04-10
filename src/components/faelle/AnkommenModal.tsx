'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MapPinIcon, FolderOpenIcon, XIcon, CameraIcon, CheckCircleIcon, LoaderIcon } from 'lucide-react'
import { uploadFallDokument } from '@/lib/dokumente/upload'

// KFZ-158 Phase 3+4: Modal das erscheint wenn der SV am Termin-Ort ankommt.
// Zeigt Termin-Details, Button um Fall-Akte zu oeffnen, + Kamera-Upload.

export type AnkommenTermin = {
  termin_id: string
  fall_id: string
  fall_nummer: string
  kunde_name: string
  adresse: string
  kennzeichen: string | null
  fahrzeug: string | null
}

export default function AnkommenModal({
  termin,
  onClose,
  onOpenAkte,
}: {
  termin: AnkommenTermin
  onClose: () => void
  onOpenAkte: () => void
}) {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadCount, setUploadCount] = useState(0)

  function handleOpenAkte() {
    onOpenAkte()
    router.push(`/gutachter/fall/${termin.fall_id}`)
  }

  async function handleCameraCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    let count = 0
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      const typ = count === 0 ? 'fotos_schaden_uebersicht' : 'fotos_schaden_detail'
      await uploadFallDokument(termin.fall_id, typ, true, 'termin', fd)
      count++
    }
    setUploadCount(prev => prev + count)
    setUploading(false)
    if (cameraRef.current) cameraRef.current.value = ''
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom"
        onClick={e => e.stopPropagation()}
      >
        {/* Header mit Pulse-Animation */}
        <div className="bg-gradient-to-r from-[#1E3A5F] to-[#4573A2] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="relative">
              <MapPinIcon className="w-8 h-8" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Du bist angekommen</h2>
              <p className="text-xs text-white/70">Termin {termin.fall_nummer}</p>
            </div>
          </div>
        </div>

        {/* Termin-Details */}
        <div className="px-5 py-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Kunde</span>
            <span className="text-gray-900 font-medium">{termin.kunde_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Adresse</span>
            <span className="text-gray-700 text-right max-w-[200px]">{termin.adresse}</span>
          </div>
          {termin.kennzeichen && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Kennzeichen</span>
              <span className="text-gray-900 font-mono">{termin.kennzeichen}</span>
            </div>
          )}
          {termin.fahrzeug && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Fahrzeug</span>
              <span className="text-gray-700">{termin.fahrzeug}</span>
            </div>
          )}
        </div>

        {/* KFZ-158 Phase 4: Quick-Foto-Upload */}
        <div className="px-5 pb-2">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleCameraCapture}
            className="hidden"
          />
          <button
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl py-3 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <><LoaderIcon className="w-4 h-4 animate-spin" /> Wird hochgeladen...</>
            ) : (
              <><CameraIcon className="w-4 h-4" /> Schadensfotos aufnehmen</>
            )}
          </button>
          {uploadCount > 0 && (
            <p className="text-[10px] text-emerald-600 text-center mt-1 flex items-center justify-center gap-1">
              <CheckCircleIcon className="w-3 h-3" /> {uploadCount} Foto(s) hochgeladen + OCR gestartet
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 space-y-2">
          <button
            onClick={handleOpenAkte}
            className="w-full flex items-center justify-center gap-2 bg-[#1E3A5F] hover:bg-[#4573A2] text-white rounded-xl py-3.5 text-sm font-semibold transition-colors"
          >
            <FolderOpenIcon className="w-4 h-4" /> Fall-Akte öffnen
          </button>
          <button
            onClick={onClose}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors"
          >
            Falscher Standort? Überspringen
          </button>
        </div>
      </div>
    </div>
  )
}
