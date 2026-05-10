'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloudIcon, XIcon, CheckCircle2Icon } from 'lucide-react'
import { uploadSvLogo, uploadBueroLogo } from '@/lib/actions/branding-actions'
import { LoadingButton } from '@/components/ui/loading-button'

// KFZ-157 / AAR-220: Logo-Upload-Step im Willkommen-Wizard.
//
// Erscheint nach erfolgreicher Stripe-Anzahlung als Step 4 für Solo-SVs und
// Büro-Inhaber. Sub-Mitarbeiter sehen diesen Step NICHT — sie erben das
// Branding der Org sobald der Inhaber sein Logo hochladet.
//
// AAR-220 Reopen: ColorPicker + manueller "Branding übernehmen"-Zwischenschritt
// wurden entfernt. Ein-Klick-Flow: Upload → Server extrahiert Farben +
// generiert Theme + speichert brand_theme JSONB → Portal passt sich an. Der
// User sieht KEINE Zwischenfarben-UI mehr.

type Props = {
  variant: 'solo' | 'buero_inhaber'
  organisationId: string | null
  onDone: () => void
}

export default function LogoUploadStep({ variant, organisationId, onDone }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    if (file.size > 2 * 1024 * 1024) {
      setError('Datei zu groß — max 2 MB')
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('logo', file)
      if (variant === 'buero_inhaber' && organisationId) {
        fd.append('organisation_id', organisationId)
      }

      // AAR-220: uploadSvLogo/uploadBueroLogo generieren Theme + schreiben
      // brand_theme JSONB direkt in die DB. Kein zusätzlicher Save-Call.
      const result = variant === 'buero_inhaber'
        ? await uploadBueroLogo(fd)
        : await uploadSvLogo(fd)

      setLogoUrl(result.logo_url)
      // Flag für die einmalige 2s-Brand-Transition (siehe GutachterShell).
      if (typeof window !== 'undefined') {
        localStorage.setItem('brand-just-changed', String(Date.now()))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }, [variant, organisationId])

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0]
    if (file) handleFile(file)
  }, [handleFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/svg+xml': ['.svg'],
      'image/webp': ['.webp'],
    },
    maxFiles: 1,
    multiple: false,
    disabled: uploading,
  })

  function handleReset() {
    setLogoUrl(null)
    setError(null)
  }

  return (
    <div className="space-y-5">
      {/* BUG-95: Header in Claimondo-CI ohne Grün */}
      <div className="bg-claimondo-ondo/5 border border-claimondo-ondo/20 rounded-xl p-4 flex items-start gap-3">
        <CheckCircle2Icon className="w-5 h-5 text-claimondo-ondo flex-shrink-0 mt-0.5" />
        <div className="text-sm text-claimondo-navy">
          <p className="font-semibold">Herzlichen Dank für Ihre Anzahlung!</p>
          <p className="text-xs text-claimondo-shield mt-1">
            Letzter Schritt: Lade jetzt dein Logo hoch für dein eigenes Branding.
            Die Farben werden automatisch aus deinem Logo extrahiert und auf dein
            gesamtes Portal angewendet.
          </p>
        </div>
      </div>

      {/* Drop-Zone (oder Vorschau wenn schon hochgeladen) */}
      {!logoUrl ? (
        <div
          {...getRootProps()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-claimondo-ondo bg-claimondo-ondo/5'
              : 'border-claimondo-border bg-claimondo-bg hover:border-claimondo-ondo hover:bg-claimondo-bg'
          } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input {...getInputProps()} />
          <UploadCloudIcon className="w-10 h-10 text-claimondo-ondo/70 mx-auto mb-3" />
          <p className="text-sm font-medium text-claimondo-navy">
            {isDragActive ? 'Hier ablegen ...' : 'Logo hierher ziehen oder klicken zum Auswählen'}
          </p>
          <p className="text-[11px] text-claimondo-ondo mt-1">PNG, JPG, SVG oder WebP — max 2 MB</p>
          {uploading && (
            <p className="text-xs text-claimondo-ondo mt-3">Logo wird verarbeitet ...</p>
          )}
        </div>
      ) : (
        <div className="border border-claimondo-border rounded-2xl p-5 space-y-3">
          {/* AAR-220: Nur noch Logo-Vorschau (kein Color-Picker, keine
              Live-Preview-Box) — der User hat Auto-CD, nichts anzupassen. */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl border border-claimondo-border bg-white flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
              </div>
              <div>
                <p className="text-sm font-medium text-claimondo-navy flex items-center gap-1.5">
                  <CheckCircle2Icon className="w-4 h-4 text-claimondo-ondo" />
                  Logo hochgeladen
                </p>
                <p className="text-[11px] text-claimondo-ondo mt-0.5">Farben automatisch extrahiert und angewendet</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-claimondo-ondo/70 hover:text-claimondo-ondo"
              aria-label="Anderes Logo wählen"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Buttons — AAR-220: nach Upload gibt es nur noch "Weiter" (Auto-Save
          ist bereits passiert), davor "Später machen" für Skip-Pfad. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDone}
          disabled={uploading}
          className="px-4 py-2.5 rounded-xl border border-claimondo-border text-claimondo-ondo text-sm hover:bg-claimondo-bg disabled:opacity-40"
        >
          Später machen
        </button>
        <LoadingButton
          isLoading={uploading}
          loadingText="Wird hochgeladen ..."
          onClick={onDone}
          disabled={!logoUrl}
          className="flex-1 py-2.5 rounded-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {logoUrl ? 'Weiter' : 'Bitte zuerst Logo hochladen'}
        </LoadingButton>
      </div>

      <p className="text-[11px] text-claimondo-ondo/70 text-center">
        Du kannst dein Logo jederzeit unter Profil → Branding ändern
      </p>
    </div>
  )
}
