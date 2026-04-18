'use client'

import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloudIcon, XIcon, ImageIcon } from 'lucide-react'

// AAR-422: Drag-Drop-Uploader für das Branding-Editor-Panel. Validiert clientseitig
// vor dem Upload. Der eigentliche Upload läuft über /api/branding/upload in der
// BrandingEditor-Parent-Komponente.

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
  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    if (file.size > MAX_BYTES) {
      alert('Datei zu groß — max 2 MB')
      return
    }
    onFile(file)
  }, [onFile])

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
              : 'border-gray-300 bg-gray-50 hover:border-[var(--brand-secondary)] hover:bg-gray-100'
          } ${uploading || disabled ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input {...getInputProps()} />
          <UploadCloudIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">
            {isDragActive ? 'Hier ablegen …' : 'Logo hierher ziehen oder klicken'}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">PNG, JPG, SVG oder WebP — max 2 MB</p>
          {uploading && <p className="text-xs text-[var(--brand-secondary)] mt-3">Wird hochgeladen …</p>}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-2xl p-4 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-xl border border-gray-200 bg-white flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Aktuelles Logo" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-[var(--brand-secondary)]" />
                Aktuelles Logo
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5 truncate">{logoUrl.split('/').pop()}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClear}
                  disabled={uploading}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <XIcon className="w-3.5 h-3.5" />
                  Anderes Logo wählen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
