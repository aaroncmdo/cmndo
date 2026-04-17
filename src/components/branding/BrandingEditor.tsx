'use client'

import { useCallback, useMemo, useState } from 'react'
import { SparklesIcon, Loader2Icon, CheckIcon, RotateCcwIcon, AlertTriangleIcon } from 'lucide-react'
import {
  CLAIMONDO_DEFAULT_THEME,
  hydrateTheme,
  themeFromLegacy,
  type BrandTheme,
  type BrandThemeV2,
} from '@/lib/branding/theme'
import {
  FONT_PAIRS,
  DEFAULT_FONT_PER_CATEGORY,
  CLAIMONDO_DEFAULT_FONT_PAIR_ID,
  type FontCategory,
  type FontPair,
} from '@/lib/branding/fonts'
import LogoUploader from './LogoUploader'
import LivePreview from './LivePreview'
import FontPicker from './FontPicker'
import ColorFineTuning from './ColorFineTuning'

// AAR-422: Hauptseiten-Komponente für /gutachter/profil/branding. Orchestriert
// Upload → Extract → Preview → Save. Änderungen am Theme oder Font wirken
// sofort auf die Preview; persistiert wird erst beim Klick auf "Speichern".

type ExtractResponse = {
  primary: string
  secondary: string
  accent: string
  brandMood: string
  recommendedFontCategory: FontCategory
  contrastSafe: boolean
  fallbackReason?: string
  candidates: { primary: string[]; secondary: string[]; accent: string[] }
}

type Props = {
  initialLogoUrl: string | null
  initialTheme: Partial<BrandTheme> | null
  initialFontPairId: string | null
  firmenname: string | null
  canSaveToOrg: boolean
}

function pickDefaultPairForCategory(cat: FontCategory): FontPair {
  return FONT_PAIRS[DEFAULT_FONT_PER_CATEGORY[cat]]
}

export default function BrandingEditor({
  initialLogoUrl,
  initialTheme,
  initialFontPairId,
  firmenname,
  canSaveToOrg,
}: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [theme, setTheme] = useState<BrandThemeV2>(() => {
    return initialTheme
      ? hydrateTheme(initialTheme, initialTheme.primary ?? null, initialTheme.secondary ?? null)
      : CLAIMONDO_DEFAULT_THEME
  })
  const [fontPair, setFontPair] = useState<FontPair>(() => {
    const id = initialFontPairId ?? CLAIMONDO_DEFAULT_FONT_PAIR_ID
    return FONT_PAIRS[id] ?? FONT_PAIRS[CLAIMONDO_DEFAULT_FONT_PAIR_ID]
  })
  const [recommendedCategory, setRecommendedCategory] = useState<FontCategory | null>(null)
  const [fallbackReason, setFallbackReason] = useState<string | null>(null)
  const [scope, setScope] = useState<'sv' | 'org'>('sv')

  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('logo', file)
      fd.append('scope', scope)
      const uploadRes = await fetch('/api/branding/upload', { method: 'POST', body: fd })
      const uploadJson = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadJson.error ?? 'Upload fehlgeschlagen')
      setLogoUrl(uploadJson.logoUrl)
      setUploading(false)

      // Extraction sofort anstoßen
      setExtracting(true)
      const extractRes = await fetch('/api/branding/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: uploadJson.logoUrl }),
      })
      const extractJson: ExtractResponse & { error?: string } = await extractRes.json()
      if (!extractRes.ok) throw new Error(extractJson.error ?? 'Extraktion fehlgeschlagen')

      const extracted = themeFromLegacy(extractJson.primary, extractJson.secondary)
      setTheme({ ...extracted, accent: extractJson.accent })
      setRecommendedCategory(extractJson.recommendedFontCategory)
      setFontPair(pickDefaultPairForCategory(extractJson.recommendedFontCategory))
      setFallbackReason(extractJson.fallbackReason ?? null)
      setDirty(true)
      setSaved(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Upload')
    } finally {
      setUploading(false)
      setExtracting(false)
    }
  }, [scope])

  const handleColorChange = useCallback((key: 'primary' | 'secondary' | 'accent' | 'background' | 'border', hex: string) => {
    setDirty(true)
    setSaved(false)
    setTheme(prev => {
      // Bei primary/secondary: komplettes Theme neu derivieren damit Hover/Active/Soft mitwandern.
      if (key === 'primary' || key === 'secondary') {
        const nextPrimary = key === 'primary' ? hex : prev.primary
        const nextSecondary = key === 'secondary' ? hex : prev.secondary
        return themeFromLegacy(nextPrimary, nextSecondary)
      }
      return { ...prev, [key]: hex }
    })
  }, [])

  const handleFontChange = useCallback((pair: FontPair) => {
    setFontPair(pair)
    setDirty(true)
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/branding/save', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logoUrl,
          theme,
          fontPairId: fontPair.id,
          scope,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Speichern fehlgeschlagen')
      setDirty(false)
      setSaved(true)
      if (typeof window !== 'undefined') {
        localStorage.setItem('brand-just-changed', String(Date.now()))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }, [logoUrl, theme, fontPair, scope])

  const handleReset = useCallback(async () => {
    if (!confirm('Branding wirklich auf Claimondo-Standard zurücksetzen?')) return
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/branding/reset?scope=${scope}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Reset fehlgeschlagen')
      setTheme(CLAIMONDO_DEFAULT_THEME)
      setFontPair(FONT_PAIRS[CLAIMONDO_DEFAULT_FONT_PAIR_ID])
      setRecommendedCategory(null)
      setFallbackReason(null)
      setDirty(false)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Reset')
    } finally {
      setSaving(false)
    }
  }, [scope])

  const fallbackHint = useMemo(() => {
    switch (fallbackReason) {
      case 'NO_COLORS': return 'Keine Farben erkannt — Claimondo-Default wird genutzt.'
      case 'SINGLE_COLOR': return 'Nur eine Logo-Farbe erkannt — Sekundär/Akzent automatisch abgeleitet.'
      case 'WCAG_FAIL': return 'Extrahierte Farbe war kontrast-schwach — wurde automatisch abgedunkelt.'
      case 'CLAUDE_OVERRIDE': return 'Claude-Vision hat eine besser passende Primärfarbe vorgeschlagen.'
      default: return null
    }
  }, [fallbackReason])

  const busy = uploading || extracting || saving

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#0D1B3E]">Branding</h1>
          <p className="text-sm text-gray-500">
            Lade dein Logo hoch — Farben & Schriftart werden automatisch extrahiert.
          </p>
        </div>
        {canSaveToOrg && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Speichern für:</span>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => { setScope('sv'); setDirty(true) }}
                className={`px-3 py-1 ${scope === 'sv' ? 'bg-[#4573A2] text-white' : 'bg-white text-gray-700'}`}
              >
                Nur ich
              </button>
              <button
                type="button"
                onClick={() => { setScope('org'); setDirty(true) }}
                className={`px-3 py-1 ${scope === 'org' ? 'bg-[#4573A2] text-white' : 'bg-white text-gray-700'}`}
              >
                Ganzes Büro
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fehler + Hinweise */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
          <AlertTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {fallbackHint && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-2">
          <SparklesIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{fallbackHint}</span>
        </div>
      )}
      {saved && !dirty && (
        <div className="px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-start gap-2">
          <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Branding gespeichert. Beim nächsten Seitenwechsel siehst du dein neues Portal.</span>
        </div>
      )}

      {/* Hauptgrid: Upload + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Logo</h2>
          <LogoUploader
            logoUrl={logoUrl}
            uploading={uploading}
            disabled={busy}
            onFile={handleFile}
            onClear={() => { setLogoUrl(null); setDirty(true); setSaved(false) }}
          />
          {extracting && (
            <div className="flex items-center gap-2 text-xs text-[#4573A2]">
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              Farben & Stil werden analysiert …
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Live-Vorschau</h2>
          <LivePreview
            theme={theme}
            fontPair={fontPair}
            logoUrl={logoUrl}
            firmenname={firmenname}
          />
        </div>
      </div>

      {/* Font-Picker */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Schriftart</h2>
        <FontPicker
          selectedPairId={fontPair.id}
          recommendedCategory={recommendedCategory}
          onChange={handleFontChange}
        />
      </div>

      {/* Feintuning */}
      <ColorFineTuning theme={theme} onChange={handleColorChange} />

      {/* Kontrast-Warnung */}
      {theme.contrastSafe === false && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-2">
          <AlertTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Kontrast-Warnung: Die aktuelle Kombination könnte schwer lesbar sein.
            Bitte Primär oder Hintergrund anpassen.
          </span>
        </div>
      )}

      {/* Aktionen */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-5">
        <button
          type="button"
          onClick={handleReset}
          disabled={busy}
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1.5 disabled:opacity-40"
        >
          <RotateCcwIcon className="w-3.5 h-3.5" />
          Auf Claimondo-Standard
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || busy}
          className="px-5 py-2 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving ? (
            <>
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              Speichere …
            </>
          ) : (
            <>
              <CheckIcon className="w-3.5 h-3.5" />
              Branding speichern
            </>
          )}
        </button>
      </div>
    </div>
  )
}
