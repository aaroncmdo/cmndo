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
import BrandPresetPicker from './BrandPresetPicker'
import { BRAND_PRESETS, type BrandPreset } from '@/lib/branding/theme-presets'
import { generateLogoPresets } from '@/lib/branding/logo-presets'
import { applyBrandPreset, saveSvBrandColors } from '@/lib/actions/branding-actions'

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
  // AAR-456: Persistierte Claude-Vision-Empfehlung — null wenn noch nie
  // analysiert oder nach Reset. Wird im FontPicker als "Empfohlen"-Badge
  // gerendert und hydratisiert den Initial-State.
  initialFontCategoryRecommendation?: FontCategory | null
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
  initialFontCategoryRecommendation,
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
  // AAR-456: Aus persistiertem Theme hydratisieren (statt immer null) — sonst
  // verschwindet der Empfohlen-Badge nach jedem Page-Reload.
  const [recommendedCategory, setRecommendedCategory] = useState<FontCategory | null>(
    initialFontCategoryRecommendation
      ?? (initialTheme?.fontCategoryRecommendation as FontCategory | null | undefined)
      ?? null,
  )
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
      // 2026-05-14: Auto-BG-Remove bei Raster-Logos. SVG (Vektor) und PNG mit
      // bekannter Transparenz überspringen. @imgly läuft on-device im Browser
      // (~25 MB Model, einmalig geladen). Result ersetzt die Quelldatei vor
      // dem Upload, sodass die Farb-Extraktion saubere transparente Pixel
      // bekommt und das Logo später in jeder Brand-Farbe gut sitzt.
      let uploadFile = file
      const isVector = file.type === 'image/svg+xml'
      const isTiny = file.size < 5 * 1024
      if (!isVector && !isTiny) {
        try {
          console.info('[branding] removing background (lazy-load imgly)…')
          const mod = await import('@imgly/background-removal')
          console.info('[branding] imgly loaded, running…')
          const cleaned = await mod.removeBackground(file, {
            debug: true,
            model: 'isnet_fp16',
            progress: (key: string, current: number, total: number) => {
              console.info(`[branding] imgly progress: ${key} ${current}/${total}`)
            },
          })
          console.info('[branding] BG removed, original=', file.size, 'cleaned=', cleaned.size)
          uploadFile = new File(
            [cleaned],
            file.name.replace(/\.[^.]+$/, '') + '-clean.png',
            { type: 'image/png' },
          )
        } catch (err) {
          // Wenn BG-Remove scheitert: mit Original-File weitermachen statt
          // komplett zu blocken. Fehler explizit als setError sichtbar machen,
          // damit der User weiß warum sein Logo noch BG hat.
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[branding] Background-Removal fehlgeschlagen:', err)
          setError(`Hintergrund-Entfernung übersprungen: ${msg.slice(0, 120)}. Original-Logo wurde hochgeladen.`)
        }
      }

      const fd = new FormData()
      fd.append('logo', uploadFile)
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
      // AAR-456: Empfehlung ins Theme schreiben, damit sie beim Speichern
      // ins brand_theme JSONB persistiert wird (sonst ist der Badge nach
      // Reload wieder weg).
      const nextTheme = {
        ...extracted,
        accent: extractJson.accent,
        fontCategoryRecommendation: extractJson.recommendedFontCategory,
      }
      const nextPair = pickDefaultPairForCategory(extractJson.recommendedFontCategory)
      setTheme(nextTheme)
      setRecommendedCategory(extractJson.recommendedFontCategory)
      setFontPair(nextPair)
      setFallbackReason(extractJson.fallbackReason ?? null)
      setDirty(true)
      setSaved(false)

      // 2026-05-14: Auto-Save direkt nach Logo-Upload + Color-Extract. Vorher
      // musste der User den separaten "Branding speichern"-Button drücken,
      // damit das frisch hochgeladene Logo + die extrahierten Farben in die DB
      // gingen. Aaron-Brief: „der Wechsel soll direkt passieren". Wir spawnen
      // den Save sofort mit dem just-extracted Theme + Pair.
      try {
        const saveRes = await fetch('/api/branding/save', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            logoUrl: uploadJson.logoUrl,
            theme: nextTheme,
            fontPairId: nextPair.id,
            scope,
          }),
        })
        const saveJson = await saveRes.json()
        if (saveRes.ok) {
          setDirty(false)
          setSaved(true)
          if (typeof window !== 'undefined') {
            localStorage.setItem('brand-just-changed', String(Date.now()))
            document.body.setAttribute('data-brand-transition', 'on')
            setTimeout(() => document.body.removeAttribute('data-brand-transition'), 1500)
          }
        } else {
          console.warn('[branding] Auto-Save fehlgeschlagen:', saveJson.error)
        }
      } catch (saveErr) {
        console.warn('[branding] Auto-Save Network-Error:', saveErr)
      }
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
        // AAR-456: Empfehlung übernehmen — themeFromLegacy() würde sie auf
        // null zurücksetzen, was den Badge beim nächsten Save killen würde.
        return {
          ...themeFromLegacy(nextPrimary, nextSecondary),
          fontCategoryRecommendation: prev.fontCategoryRecommendation,
        }
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
        // 2026-05-14: Sofortige in-place Transition. Globale CSS-Regel reagiert
        // auf das data-Attribut und animiert alle Children-Farben für 1.2s.
        // Auf dem Editor selbst greift das schon hier (LivePreview + Sidebar
        // schalten sanft um). Beim nächsten Page-Load liest GutachterShell
        // den localStorage-Flag und wiederholt die Animation für die volle
        // App-Sicht (z.B. zurück auf /gutachter/heute).
        document.body.setAttribute('data-brand-transition', 'on')
        setTimeout(() => {
          document.body.removeAttribute('data-brand-transition')
        }, 1500)
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
          <h1 className="text-xl font-semibold text-[var(--brand-primary)]">Branding</h1>
          <p className="text-sm text-claimondo-ondo">
            Lade dein Logo hoch — Farben & Schriftart werden automatisch extrahiert.
          </p>
        </div>
        {canSaveToOrg && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-claimondo-ondo">Speichern für:</span>
            <div className="inline-flex rounded-lg border border-claimondo-border overflow-hidden">
              <button
                type="button"
                onClick={() => { setScope('sv'); setDirty(true) }}
                className={`px-3 py-1 ${scope === 'sv' ? 'bg-[var(--brand-secondary)] text-white' : 'bg-white text-claimondo-navy'}`}
              >
                Nur ich
              </button>
              <button
                type="button"
                onClick={() => { setScope('org'); setDirty(true) }}
                className={`px-3 py-1 ${scope === 'org' ? 'bg-[var(--brand-secondary)] text-white' : 'bg-white text-claimondo-navy'}`}
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
          <h2 className="text-sm font-semibold text-claimondo-navy">Logo</h2>
          <LogoUploader
            logoUrl={logoUrl}
            uploading={uploading}
            disabled={busy}
            onFile={handleFile}
            onClear={() => { setLogoUrl(null); setDirty(true); setSaved(false) }}
          />
          {extracting && (
            <div className="flex items-center gap-2 text-xs text-[var(--brand-secondary)]">
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              Farben & Stil werden analysiert …
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-claimondo-navy">Live-Vorschau</h2>
          <LivePreview
            theme={theme}
            fontPair={fontPair}
            logoUrl={logoUrl}
            firmenname={firmenname}
          />
        </div>
      </div>

      {/* 2026-05-14: Zwei Preset-Modi. Mit Logo: dynamische Variationen der
          extrahierten Logo-Farben (Aaron-Brief „diese Schemata müssen auf die
          Farben des Logos angepasst werden"). Ohne Logo: statische KFZ-Themes
          als Quick-Start. Klick → Server-Action + globale Brand-Transition. */}
      {logoUrl ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-claimondo-navy">Stile aus deinem Logo</h2>
          <p className="text-xs text-claimondo-ondo">
            Fünf Variationen mit deinen Logo-Farben in unterschiedlichen Rollen. Klick wendet sofort an.
          </p>
          <BrandPresetPicker
            presets={generateLogoPresets({
              primary: theme.primary,
              secondary: theme.secondary,
              accent: theme.accent ?? theme.secondary,
            })}
            activePresetId={null}
            onApply={async (preset: BrandPreset) => {
              // Logo-Presets werden NICHT als gespeicherte preset-IDs persistiert
              // (sie sind dynamisch aus dem Logo). Stattdessen den Farb-Set
              // direkt via saveSvBrandColors schreiben.
              const res = await saveSvBrandColors({
                brand_primary: preset.primary,
                brand_secondary: preset.secondary,
              })
              if (!res.ok) {
                setError(res.error ?? 'Stil konnte nicht angewendet werden')
                return false
              }
              setTheme({
                ...themeFromLegacy(preset.primary, preset.secondary),
                accent: preset.accent,
                fontPairId: preset.fontPairId,
              })
              const pair = FONT_PAIRS[preset.fontPairId]
              if (pair) setFontPair(pair)
              setSaved(true)
              setDirty(false)
              return true
            }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-claimondo-navy">Brand-Voreinstellungen</h2>
          <p className="text-xs text-claimondo-ondo">
            Sechs Klick-Themes für KFZ-Werkstätten & Sachverständige. Wendet sich sofort an, du kannst danach noch feintunen.
          </p>
          <BrandPresetPicker
            activePresetId={
              BRAND_PRESETS.find(p => p.primary.toLowerCase() === theme.primary.toLowerCase())?.id ?? null
            }
            onApply={async (preset: BrandPreset) => {
              const res = await applyBrandPreset({ presetId: preset.id, scope })
              if (!res.ok) {
                setError(res.error ?? 'Preset-Fehler')
                return false
              }
              setTheme({
                ...themeFromLegacy(preset.primary, preset.secondary),
                accent: preset.accent,
                fontPairId: preset.fontPairId,
              })
              const pair = FONT_PAIRS[preset.fontPairId]
              if (pair) setFontPair(pair)
              setSaved(true)
              setDirty(false)
              return true
            }}
          />
        </div>
      )}

      {/* Font-Picker */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-claimondo-navy">Schriftart</h2>
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
      <div className="flex items-center justify-end gap-3 border-t border-claimondo-border pt-5">
        <button
          type="button"
          onClick={handleReset}
          disabled={busy}
          className="text-sm text-claimondo-ondo hover:text-claimondo-navy flex items-center gap-1.5 disabled:opacity-40"
        >
          <RotateCcwIcon className="w-3.5 h-3.5" />
          Auf Claimondo-Standard
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || busy}
          className="px-5 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
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
