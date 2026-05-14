'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloudIcon, XIcon, CheckCircle2Icon, SparklesIcon } from 'lucide-react'
import { uploadSvLogo, uploadBueroLogo, applyBrandPreset } from '@/lib/actions/branding-actions'
import { LoadingButton } from '@/components/ui/loading-button'
import BrandPresetPicker from '@/components/branding/BrandPresetPicker'

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

  // 2026-05-14: imgly Model preload bei Mount — kein 20-40s Wait beim ersten
  // Upload-Click (88 MB Model + 12 MB WASM von staticimgly.com).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const mod = await import('@imgly/background-removal')
        if (cancelled) return
        await mod.preload({ model: 'isnet_fp16' })
      } catch (err) {
        console.warn('[onboarding-branding] imgly preload skipped:', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    if (file.size > 2 * 1024 * 1024) {
      setError('Datei zu groß — max 2 MB')
      return
    }

    setUploading(true)
    try {
      // 2026-05-14: Auto-BG-Remove auch hier (genau wie im BrandingEditor).
      // Logo wird transparent — wirkt auf jeder Brand-Farbe gut. SVG + Mini-
      // Files überspringen.
      let uploadFile = file
      const isVector = file.type === 'image/svg+xml'
      const isTiny = file.size < 5 * 1024
      if (!isVector && !isTiny) {
        try {
          console.info('[onboarding-branding] removing background…')
          const mod = await import('@imgly/background-removal')
          const cleaned = await mod.removeBackground(file)
          console.info('[onboarding-branding] cleaned size=', cleaned.size)
          uploadFile = new File(
            [cleaned],
            file.name.replace(/\.[^.]+$/, '') + '-clean.png',
            { type: 'image/png' },
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[onboarding-branding] BG-Remove fehlgeschlagen:', err)
          setError(`Hintergrund-Entfernung übersprungen: ${msg.slice(0, 120)}. Original-Logo wird hochgeladen.`)
        }
      }

      const fd = new FormData()
      fd.append('logo', uploadFile)
      if (variant === 'buero_inhaber' && organisationId) {
        fd.append('organisation_id', organisationId)
      }

      const result = variant === 'buero_inhaber'
        ? await uploadBueroLogo(fd)
        : await uploadSvLogo(fd)

      if (!result.ok) {
        setError(result.error)
        return
      }
      setLogoUrl(result.logo_url)
      // 2026-05-14: Direct in-place Transition statt warten auf Page-Reload.
      // Globale CSS-Rule reagiert auf data-attribute (siehe globals.css).
      if (typeof window !== 'undefined') {
        localStorage.setItem('brand-just-changed', String(Date.now()))
        document.body.setAttribute('data-brand-transition', 'on')
        setTimeout(() => {
          document.body.removeAttribute('data-brand-transition')
        }, 1500)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }, [variant, organisationId])

  // 2026-05-14: Preset-Handler — wenn der SV kein eigenes Logo hat oder schnell
  // etwas Standardes wählen will. Setzt brand_primary/secondary/accent +
  // fontPairId direkt in die DB, lässt logo_url unverändert.
  const handlePreset = useCallback(async (preset: { id: string }) => {
    setError(null)
    setUploading(true)
    try {
      const scope = variant === 'buero_inhaber' && organisationId ? 'org' : 'sv'
      const result = await applyBrandPreset({ presetId: preset.id, scope })
      if (!result.ok) {
        setError(result.error ?? 'Preset konnte nicht angewendet werden')
        return false
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preset-Fehler')
      return false
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
      <div className="bg-claimondo-ondo/5 border border-claimondo-ondo/20 rounded-ios-xl p-4 flex items-start gap-3">
        <CheckCircle2Icon className="w-5 h-5 text-[var(--brand-text-secondary)] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-[var(--brand-text-primary)]">
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
          <UploadCloudIcon className="w-10 h-10 text-[var(--brand-text-muted)] mx-auto mb-3" />
          <p className="text-sm font-medium text-[var(--brand-text-primary)]">
            {isDragActive ? 'Hier ablegen ...' : 'Logo hierher ziehen oder klicken zum Auswählen'}
          </p>
          <p className="text-[11px] text-[var(--brand-text-secondary)] mt-1">PNG, JPG, SVG oder WebP — max 2 MB</p>
          {uploading && (
            <p className="text-xs text-[var(--brand-text-secondary)] mt-3">Logo wird verarbeitet ...</p>
          )}
        </div>
      ) : (
        <div className="border border-claimondo-border rounded-2xl p-5 space-y-3">
          {/* AAR-220: Nur noch Logo-Vorschau (kein Color-Picker, keine
              Live-Preview-Box) — der User hat Auto-CD, nichts anzupassen. */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-ios-xl border border-claimondo-border bg-white flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--brand-text-primary)] flex items-center gap-1.5">
                  <CheckCircle2Icon className="w-4 h-4 text-[var(--brand-text-secondary)]" />
                  Logo hochgeladen
                </p>
                <p className="text-[11px] text-[var(--brand-text-secondary)] mt-0.5">Farben automatisch extrahiert und angewendet</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-[var(--brand-text-muted)] hover:text-[var(--brand-text-secondary)]"
              aria-label="Anderes Logo wählen"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="px-3 py-2.5 rounded-ios-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* 2026-05-14: Preset-Picker — kuratierte Theme-Vorschläge für SVs ohne
          Logo oder mit unkonkretem Logo. Klick auf eine Card schreibt Theme
          direkt + globale Transition fadet die ganze App auf das neue Set. */}
      {!logoUrl && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-[var(--brand-text-secondary)]" />
            <p className="text-sm font-semibold text-[var(--brand-text-primary)]">
              Oder direkt eine Brand-Voreinstellung wählen
            </p>
          </div>
          <p className="text-[11px] text-claimondo-shield">
            Kuratierte KFZ-Themes mit passender Schriftart. Du kannst später jederzeit ein eigenes Logo hochladen.
          </p>
          <BrandPresetPicker onApply={handlePreset} />
        </div>
      )}

      {/* Buttons — AAR-220: nach Upload gibt es nur noch "Weiter" (Auto-Save
          ist bereits passiert), davor "Später machen" für Skip-Pfad. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDone}
          disabled={uploading}
          className="px-4 py-2.5 rounded-ios-xl border border-claimondo-border text-[var(--brand-text-secondary)] text-sm hover:bg-claimondo-bg disabled:opacity-40"
        >
          Später machen
        </button>
        <LoadingButton
          isLoading={uploading}
          loadingText="Wird hochgeladen ..."
          onClick={onDone}
          disabled={!logoUrl}
          className="flex-1 py-2.5 rounded-ios-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {logoUrl ? 'Weiter' : 'Bitte zuerst Logo hochladen'}
        </LoadingButton>
      </div>

      <p className="text-[11px] text-[var(--brand-text-muted)] text-center">
        Du kannst dein Logo jederzeit unter Profil → Branding ändern
      </p>
    </div>
  )
}
