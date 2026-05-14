'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloudIcon, XIcon, ImageIcon, ScissorsIcon, Loader2Icon } from 'lucide-react'

// AAR-422: Drag-Drop-Uploader für das Branding-Editor-Panel. Validiert clientseitig
// vor dem Upload. Der eigentliche Upload läuft über /api/branding/upload in der
// BrandingEditor-Parent-Komponente.
//
// 2026-05-14: Background-Remover-Button. @imgly/background-removal läuft on-device
// im Browser (ONNX im WebWorker), kein Server-Roundtrip nötig. Lazy-loaded weil das
// ML-Model + WASM zusammen ~25MB sind und initial nicht gebraucht werden.

type Props = {
  logoUrl: string | null
  uploading: boolean
  onFile: (file: File) => void
  onClear: () => void
  disabled?: boolean
}

const ACCEPT = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/svg+xml': ['.svg'],
  'image/webp': ['.webp'],
}
const MAX_BYTES = 2 * 1024 * 1024

export default function LogoUploader({ logoUrl, uploading, onFile, onClear, disabled }: Props) {
  const [removingBg, setRemovingBg] = useState(false)
  const [bgError, setBgError] = useState<string | null>(null)

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    if (file.size > MAX_BYTES) {
      alert('Datei zu groß — max 2 MB')
      return
    }
    onFile(file)
  }, [onFile])

  const handleRemoveBackground = useCallback(async () => {
    if (!logoUrl || removingBg || uploading) return
    setBgError(null)
    setRemovingBg(true)
    try {
      // Lazy-Import damit das 25-MB-Model-Bundle erst beim ersten Click geladen
      // wird (vorher: zero impact auf Initial-Page-Load).
      const { removeBackground } = await import('@imgly/background-removal')
      // Aktuelles Logo als Blob ziehen — kann eine Supabase-Storage-URL sein.
      const resp = await fetch(logoUrl, { mode: 'cors' })
      if (!resp.ok) throw new Error(`Konnte Logo nicht laden (HTTP ${resp.status})`)
      const sourceBlob = await resp.blob()
      // On-device ML — Output ist ein PNG mit transparenten Pixeln.
      const cleanedBlob = await removeBackground(sourceBlob)
      // Als Datei verpacken und durch den normalen Upload-Pfad jagen
      // (re-extract der Farben passiert dann automatisch in BrandingEditor).
      const file = new File([cleanedBlob], 'logo-transparent.png', { type: 'image/png' })
      onFile(file)
    } catch (err) {
      setBgError(err instanceof Error ? err.message : 'Hintergrund-Entfernung fehlgeschlagen')
    } finally {
      setRemovingBg(false)
    }
  }, [logoUrl, removingBg, uploading, onFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles: 1,
    multiple: false,
    disabled: uploading || disabled,
  })

  return (
    <div className="space-y-3">
      {!logoUrl ? (
        <div
          {...getRootProps()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-[var(--brand-secondary)] bg-[var(--brand-secondary)]/5'
              : 'border-claimondo-border bg-claimondo-bg hover:border-[var(--brand-secondary)] hover:bg-claimondo-bg'
          } ${uploading || disabled ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input {...getInputProps()} />
          <UploadCloudIcon className="w-10 h-10 text-claimondo-ondo/70 mx-auto mb-3" />
          <p className="text-sm font-medium text-claimondo-navy">
            {isDragActive ? 'Hier ablegen …' : 'Logo hierher ziehen oder klicken'}
          </p>
          <p className="text-[11px] text-claimondo-ondo mt-1">PNG, JPG, SVG oder WebP — max 2 MB</p>
          {uploading && <p className="text-xs text-[var(--brand-secondary)] mt-3">Wird hochgeladen …</p>}
        </div>
      ) : (
        <div className="border border-claimondo-border rounded-2xl p-4 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-xl border border-claimondo-border bg-white flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Aktuelles Logo" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-claimondo-navy flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-[var(--brand-secondary)]" />
                Aktuelles Logo
              </p>
              <p className="text-[11px] text-claimondo-ondo mt-0.5 truncate">{logoUrl.split('/').pop()}</p>
              <div className="mt-2 flex flex-wrap gap-3 items-center">
                <button
                  type="button"
                  onClick={onClear}
                  disabled={uploading || removingBg}
                  className="text-xs text-claimondo-ondo hover:text-claimondo-navy flex items-center gap-1 disabled:opacity-50"
                >
                  <XIcon className="w-3.5 h-3.5" />
                  Anderes Logo wählen
                </button>
                <button
                  type="button"
                  onClick={handleRemoveBackground}
                  disabled={uploading || removingBg}
                  className="text-xs text-[var(--brand-secondary)] hover:text-claimondo-navy flex items-center gap-1 disabled:opacity-50"
                  title="Hintergrund mit On-Device-ML entfernen — kann ein paar Sekunden dauern beim ersten Mal."
                >
                  {removingBg ? (
                    <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ScissorsIcon className="w-3.5 h-3.5" />
                  )}
                  {removingBg ? 'Hintergrund wird entfernt …' : 'Hintergrund entfernen'}
                </button>
              </div>
              {bgError && (
                <p className="text-[11px] text-rose-600 mt-1.5">{bgError}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
