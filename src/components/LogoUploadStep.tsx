'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { ImageIcon, UploadCloudIcon, XIcon, CheckCircle2Icon } from 'lucide-react'
import {
  uploadSvLogo,
  uploadBueroLogo,
  saveSvBrandColors,
  saveBueroBrandColors,
} from '@/lib/actions/branding-actions'
import { LoadingButton } from '@/components/ui/loading-button'

// KFZ-157: Logo-Upload-Step im Willkommen-Wizard.
//
// Erscheint nach erfolgreicher Stripe-Anzahlung als Step 4 fuer Solo-SVs
// und Buero-Inhaber. Sub-Mitarbeiter sehen diesen Step NICHT — sie erben
// das Branding der Org sobald der Inhaber sein Logo hochladet.
//
// Flow:
//   1. Drop-Zone (PNG/SVG/JPG/WebP, max 2 MB) via react-dropzone
//   2. Upload via Server Action → Logo wandert in Storage, Farben werden
//      server-seitig via node-vibrant aus dem Bild extrahiert
//   3. Vorschau-Box zeigt die erkannten Farben mit manueller Override
//      via Color-Picker
//   4. 'Speichern' uebernimmt die ggf. veraenderten Farben in die DB
//   5. 'Spaeter machen' Skip-Button uebergeht den ganzen Schritt

type Props = {
  variant: 'solo' | 'buero_inhaber'
  organisationId: string | null
  onDone: () => void
}

export default function LogoUploadStep({ variant, organisationId, onDone }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [primary, setPrimary] = useState<string>('#1E3A5F')
  const [secondary, setSecondary] = useState<string>('#4573A2')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    if (file.size > 2 * 1024 * 1024) {
      setError('Datei zu gross — max 2 MB')
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('logo', file)
      if (variant === 'buero_inhaber' && organisationId) {
        fd.append('organisation_id', organisationId)
      }

      const result = variant === 'buero_inhaber'
        ? await uploadBueroLogo(fd)
        : await uploadSvLogo(fd)

      setLogoUrl(result.logo_url)
      setPrimary(result.brand_primary)
      setSecondary(result.brand_secondary)
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

  async function handleSaveColors() {
    if (!logoUrl) { onDone(); return }
    setSaving(true)
    setError(null)
    try {
      if (variant === 'buero_inhaber') {
        if (!organisationId) throw new Error('Keine Organisation')
        await saveBueroBrandColors({
          organisation_id: organisationId,
          brand_primary: primary,
          brand_secondary: secondary,
        })
      } else {
        await saveSvBrandColors({ brand_primary: primary, brand_secondary: secondary })
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setLogoUrl(null)
    setPrimary('#1E3A5F')
    setSecondary('#4573A2')
    setError(null)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
        <CheckCircle2Icon className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-emerald-800">
          <p className="font-semibold">Herzlichen Dank fuer Ihre Anzahlung!</p>
          <p className="text-xs text-emerald-700 mt-1">
            Letzter Schritt: Lade jetzt dein Logo hoch fuer dein eigenes Branding.
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
              ? 'border-[#4573A2] bg-[#4573A2]/5'
              : 'border-gray-300 bg-gray-50 hover:border-[#4573A2] hover:bg-gray-100'
          } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input {...getInputProps()} />
          <UploadCloudIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">
            {isDragActive ? 'Hier ablegen ...' : 'Logo hierher ziehen oder klicken zum Auswaehlen'}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">PNG, JPG, SVG oder WebP — max 2 MB</p>
          {uploading && (
            <p className="text-xs text-[#4573A2] mt-3">Logo wird verarbeitet ...</p>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-2xl p-5 space-y-4">
          {/* Logo + Reset */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl border border-gray-200 bg-white flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                  <CheckCircle2Icon className="w-4 h-4 text-emerald-500" />
                  Logo hochgeladen
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">Farben automatisch extrahiert</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Anderes Logo waehlen"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Erkannte Farben */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-3">
              Erkannte Farben — bei Bedarf anpassen
            </p>
            <div className="flex items-center gap-4">
              <ColorPickerRow label="Primaer" value={primary} onChange={setPrimary} />
              <ColorPickerRow label="Akzent" value={secondary} onChange={setSecondary} />
            </div>
          </div>

          {/* Live-Preview */}
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <div className="px-4 py-2.5 text-white text-xs font-semibold" style={{ backgroundColor: primary }}>
              Vorschau — so sieht dein Header aus
            </div>
            <div className="p-3 bg-white flex items-center gap-2">
              <div className="text-[11px] px-2 py-1 rounded text-white font-medium" style={{ backgroundColor: secondary }}>
                Akzent-Button
              </div>
              <div className="text-[11px] text-gray-500">Beispiel-Element</div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDone}
          disabled={uploading || saving}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-40"
        >
          Spaeter machen
        </button>
        <LoadingButton
          isLoading={saving}
          loadingText="Wird gespeichert..."
          onClick={handleSaveColors}
          disabled={!logoUrl || uploading}
          className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {logoUrl ? 'Branding uebernehmen & weiter' : 'Logo hochladen'}
        </LoadingButton>
      </div>

      <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1">
        <ImageIcon className="w-3 h-3" />
        Du kannst dein Logo jederzeit unter Profil → Branding aendern
      </p>
    </div>
  )
}

function ColorPickerRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-gray-300 cursor-pointer p-0"
        aria-label={`${label}-Farbe`}
      />
      <div>
        <p className="text-[10px] text-gray-500 uppercase">{label}</p>
        <p className="text-xs font-mono text-gray-700">{value.toUpperCase()}</p>
      </div>
    </label>
  )
}
