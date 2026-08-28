'use client'

// AAR-zb1-wizard: Kamera-basierter Fahrzeugschein-Upload mit OCR + editierbarer Preview.
//
// Zustands-Maschine: idle → uploading → preview (editierbar) → confirmed
// Fehler-Zweig:     uploading → error → idle (Retry) … nach 2 Fails: Skip-Link
//
// Daten-Flow:
//   1. Foto via <input capture="environment"> oder Galerie
//   2. compressImage(file) → uploadDokumentViaAnfrageToken(token, 'fahrzeugschein', base64)
//      (28.08.: ohne Komprimierung brach die Server-Action bei Handy-Fotos, s. handleFile)
//   3. OCR + leads-Update läuft serverseitig (H6-Regel, schreibt nur leere Felder)
//   4. extracted-Payload prefilled Preview-Inputs
//   5. Kunde editiert/bestätigt → onChange triggert ggf. confirmZb1Korrekturen

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { OnboardingFeld } from '../types'
import { uploadDokumentViaAnfrageToken } from '@/app/upload/dokumente/[token]/actions'
import { compressImage } from '@/lib/dokumente/compress-image'
import { confirmZb1Korrekturen, clearZb1Felder } from '@/app/kunde/onboarding-details/zb1-actions'

type Status = 'idle' | 'uploading' | 'preview' | 'error' | 'skipped'

// Ops-Test 11.08. (RC-3): Die Feldmenge stand vorher VIERMAL untereinander
// (Upload-Result, Extracted-Typ, leereExtracted, Diff-Bildung) — jedes Mal mit
// denselben 4 Feldern, obwohl der Parser 15 liefert. Halteradresse, FIN, HSN/TSN
// und Erstzulassung konnte der Kunde damit weder sehen noch korrigieren. Eine
// Liste als Quelle verhindert, dass die Stellen wieder auseinanderlaufen.
const ZB1_FELDER = [
  'kennzeichen',
  'fahrzeug_hersteller',
  'fahrzeug_modell',
  'erstzulassung',
  'fahrzeug_farbe',
  'halter_name',
  'halter_strasse',
  'halter_plz',
  'halter_stadt',
  'fin',
  'hsn',
  'tsn',
] as const

type Zb1Feld = (typeof ZB1_FELDER)[number]
type Extracted = Record<Zb1Feld, string>

/** Anzeige-Reihenfolge in der Preview, gruppiert. i18n-Key je Feld. */
const GRUPPEN: ReadonlyArray<{ titelKey: string; felder: ReadonlyArray<{ feld: Zb1Feld; labelKey: string }> }> = [
  {
    titelKey: 'zb1_gruppe_fahrzeug',
    felder: [
      { feld: 'kennzeichen', labelKey: 'zb1_label_kennzeichen' },
      { feld: 'fahrzeug_hersteller', labelKey: 'zb1_label_hersteller' },
      { feld: 'fahrzeug_modell', labelKey: 'zb1_label_modell' },
      { feld: 'erstzulassung', labelKey: 'zb1_label_erstzulassung' },
      { feld: 'fahrzeug_farbe', labelKey: 'zb1_label_farbe' },
    ],
  },
  {
    titelKey: 'zb1_gruppe_halter',
    felder: [
      { feld: 'halter_name', labelKey: 'zb1_label_halter' },
      { feld: 'halter_strasse', labelKey: 'zb1_label_halter_strasse' },
      { feld: 'halter_plz', labelKey: 'zb1_label_halter_plz' },
      { feld: 'halter_stadt', labelKey: 'zb1_label_halter_stadt' },
    ],
  },
  {
    titelKey: 'zb1_gruppe_technisch',
    felder: [
      { feld: 'fin', labelKey: 'zb1_label_fin' },
      { feld: 'hsn', labelKey: 'zb1_label_hsn' },
      { feld: 'tsn', labelKey: 'zb1_label_tsn' },
    ],
  },
]

const MAX_VERSUCHE = 2

interface Props {
  feld: OnboardingFeld
  value: unknown
  onChange: (val: unknown) => void
  disabled?: boolean
  // Vom DynamicWizard injiziert
  token: string | null
  fallId: string | null
}

export function Zb1UploadField({ feld, value, onChange, disabled, token, fallId }: Props) {
  const t = useTranslations('wizard_fields')
  const initialExtracted = readExtractedFromValue(value)
  const [status, setStatus] = useState<Status>(initialExtracted ? 'preview' : 'idle')
  const [extracted, setExtracted] = useState<Extracted | null>(initialExtracted)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [versuche, setVersuche] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const [edit, setEdit] = useState<Extracted>(initialExtracted ?? leereExtracted())

  async function handleFile(file: File) {
    if (!token) {
      setStatus('error')
      setErrorMsg(t('zb1_token_fehlt'))
      return
    }
    setStatus('uploading')
    setErrorMsg(null)

    // ⭐ Prod-Smoke 28.08.: Ein Foto direkt vom Handy (2–5 MB) sprengte die Server-Action.
    // Gemessen gegen prod: 1 MB → HTTP 500 „Maximum array nesting exceeded" (React
    // serialisiert den base64-String beim Flight-Transport), 10 KB → laeuft durch.
    // `bodySizeLimit` (20 MB) ist NICHT die Grenze — die liegt im Serialisierer.
    const bild = await verkleinereBild(file)
    if (!bild) {
      setVersuche(v => v + 1)
      setStatus('error')
      setErrorMsg(t('zb1_foto_lesefehler'))
      return
    }

    // ⭐ Ohne dieses try/catch blieb die Oberflaeche bei einem Server-Fehler FUER IMMER
    // auf „Foto wird ausgewertet …" stehen (3 Min im Smoke beobachtet): die Action wirft,
    // `handleFile` bricht ab, `status` bleibt 'uploading'. Kein Fehler, kein Retry,
    // kein Weiterkommen. Dieselbe Klasse wie das leere `.catch()` aus #5695 — ein
    // Fehlschlag, den der Nutzer nicht sehen kann.
    let res: Awaited<ReturnType<typeof uploadDokumentViaAnfrageToken>>
    try {
      res = await uploadDokumentViaAnfrageToken(token, 'fahrzeugschein', bild.base64, bild.mime)
    } catch (err) {
      console.error('[zb1-field] Upload-Action fehlgeschlagen:', err)
      setVersuche(v => v + 1)
      setStatus('error')
      setErrorMsg(t('zb1_ocr_fehler'))
      return
    }
    if (!res.success) {
      setVersuche(v => v + 1)
      setStatus('error')
      setErrorMsg(res.error ?? t('zb1_ocr_fehler'))
      return
    }

    const roh = (res.extracted ?? {}) as Partial<Record<Zb1Feld, string | null>>
    const ex = Object.fromEntries(ZB1_FELDER.map((f) => [f, roh[f] ?? ''])) as Extracted
    setExtracted(ex)
    setEdit(ex)
    setStatus('preview')
    // Wizard-Wert = Marker, dass Field erledigt ist (für Pflicht-Validierung).
    // Der eigentliche DB-Write ist schon durch den OCR-Endpoint passiert.
    onChange({ status: 'ok', extracted: ex })
  }

  async function handleNeuFotografieren() {
    if (!fallId) {
      setStatus('idle')
      return
    }
    // Reset leads-Felder, damit zweiter OCR-Run die neuen Werte schreiben kann
    await clearZb1Felder(fallId)
    setExtracted(null)
    setEdit(leereExtracted())
    setErrorMsg(null)
    setStatus('idle')
    onChange(null)
    inputRef.current?.click()
  }

  async function handleBestaetigen() {
    if (!fallId || !extracted) return
    // Nur geaenderte Felder schreiben — die Action macht daraus ein Force-Update,
    // das die H6-Regel (nur leere Felder) bewusst umgeht.
    const diff: Parameters<typeof confirmZb1Korrekturen>[1] = {}
    for (const feld of ZB1_FELDER) {
      if (edit[feld] !== extracted[feld]) diff[feld] = edit[feld] || null
    }

    if (Object.keys(diff).length > 0) {
      const res = await confirmZb1Korrekturen(fallId, diff)
      if (!res.ok) {
        console.error('[zb1-field] Korrektur fehlgeschlagen:', res.error)
      }
    }
    onChange({ status: 'confirmed', extracted: edit })
  }

  function handleSkip() {
    setStatus('skipped')
    onChange({ status: 'skipped' })
  }

  function openGallery() {
    if (!inputRef.current) return
    inputRef.current.removeAttribute('capture')
    inputRef.current.click()
    setTimeout(() => inputRef.current?.setAttribute('capture', 'environment'), 100)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--claimondo-navy)', letterSpacing: '-.01em', display: 'flex', alignItems: 'center', gap: 6 }}>
        {feld.label}
        {feld.pflicht && <span style={{ color: 'var(--brand-warning, #FF9F0A)', fontSize: 13 }}>*</span>}
      </label>
      {feld.hint && status === 'idle' && (
        <span style={{ fontSize: 13, color: 'var(--wiz-text-3)', marginTop: -2 }}>
          {feld.hint}
        </span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />

      {(status === 'idle' || status === 'error') && (
        <CaptureButtons
          disabled={!!disabled}
          onCamera={() => inputRef.current?.click()}
          onGallery={openGallery}
        />
      )}

      {status === 'uploading' && (
        <div style={infoBoxStyle('info')}>
          <Spinner /> {t('zb1_auswertung')}
        </div>
      )}

      {status === 'error' && errorMsg && (
        <div style={infoBoxStyle('error')}>{errorMsg}</div>
      )}

      {status === 'error' && versuche >= MAX_VERSUCHE && (
        <button type="button" onClick={handleSkip} style={skipLinkStyle}>
          {t('zb1_skip')}
        </button>
      )}

      {status === 'preview' && (
        <PreviewCard
          edit={edit}
          onChange={setEdit}
          onConfirm={handleBestaetigen}
          onRetake={handleNeuFotografieren}
        />
      )}

      {status === 'skipped' && (
        <div style={infoBoxStyle('warn')}>
          {t('zb1_uebersprungen')}
        </div>
      )}
    </div>
  )
}

// ─── Sub-Components ───────────────────────────────────────────────────

function CaptureButtons({ disabled, onCamera, onGallery }: { disabled: boolean; onCamera: () => void; onGallery: () => void }) {
  const t = useTranslations('wizard_fields')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={onCamera}
        style={{
          background: 'var(--claimondo-ondo)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--wiz-r-md)',
          padding: '18px 16px',
          fontSize: 16,
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          letterSpacing: '-.01em',
          boxShadow: '0 4px 12px rgba(69,115,162,.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}
      >
        <span style={{ fontSize: 22 }}>📷</span>
        {t('zb1_kamera')}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onGallery}
        style={{
          background: 'transparent',
          color: 'var(--claimondo-ondo)',
          border: 'none',
          padding: '8px',
          fontSize: 14,
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          textDecoration: 'underline',
          fontFamily: 'inherit',
        }}
      >
        {t('zb1_galerie')}
      </button>
    </div>
  )
}

function PreviewCard({
  edit, onChange, onConfirm, onRetake,
}: {
  edit: Extracted
  onChange: (e: Extracted) => void
  onConfirm: () => void
  onRetake: () => void
}) {
  const t = useTranslations('wizard_fields')
  return (
    <div style={{
      background: 'rgba(52,199,89,.06)',
      border: '1px solid rgba(52,199,89,.25)',
      borderRadius: 'var(--wiz-r-md)',
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-success, #1a7a35)', letterSpacing: '-.005em' }}>
        {t('zb1_preview_titel')}
      </div>
      {/* Ops-Test 11.08. (RC-3): Die Texterkennung liegt regelmaessig daneben — im
          Testfall stand als Strasse das Formularfeld-Label statt der Adresse. Der
          Hinweis macht klar, dass Pruefen erwartet wird, nicht blindes Bestaetigen. */}
      <div style={{ fontSize: 12, color: 'var(--wiz-text-3)', marginTop: -6 }}>
        {t('zb1_pruefen_hinweis')}
      </div>
      {GRUPPEN.map((gruppe) => (
        <div key={gruppe.titelKey} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--wiz-text-3)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
            {t(gruppe.titelKey)}
          </div>
          {gruppe.felder.map(({ feld, labelKey }) => (
            <EditRow
              key={feld}
              label={t(labelKey)}
              value={edit[feld]}
              onChange={(v) => onChange({ ...edit, [feld]: v })}
            />
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onRetake}
          style={{
            background: 'var(--wiz-fill)',
            color: 'var(--claimondo-navy)',
            border: 'none',
            borderRadius: 999,
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {t('zb1_neu')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            background: 'var(--brand-success, #1a7a35)',
            color: '#fff',
            border: 'none',
            borderRadius: 999,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            marginLeft: 'auto',
          }}
        >
          {t('zb1_uebernehmen')}
        </button>
      </div>
    </div>
  )
}

function EditRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--wiz-text-3)', letterSpacing: '-.005em' }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: '#fff',
          border: '1px solid var(--wiz-separator)',
          borderRadius: 'var(--wiz-r-sm)',
          padding: '10px 12px',
          fontSize: 15,
          fontFamily: 'inherit',
          color: 'var(--claimondo-navy)',
          letterSpacing: '-.005em',
        }}
      />
    </div>
  )
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  )
}

const skipLinkStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--claimondo-ondo)',
  border: 'none',
  padding: '6px 0',
  fontSize: 14,
  fontWeight: 500,
  textDecoration: 'underline',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
}

function infoBoxStyle(kind: 'info' | 'error' | 'warn'): React.CSSProperties {
  const palette = {
    info:  { bg: 'rgba(69,115,162,.08)',  fg: 'var(--claimondo-navy)' },
    error: { bg: 'rgba(255,59,48,.08)',   fg: '#c0392b' },
    warn:  { bg: 'rgba(255,159,10,.10)',  fg: '#a8650a' },
  }[kind]
  return {
    background: palette.bg,
    color: palette.fg,
    padding: '14px 16px',
    borderRadius: 'var(--wiz-r-sm)',
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: '-.005em',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function leereExtracted(): Extracted {
  return Object.fromEntries(ZB1_FELDER.map((f) => [f, ''])) as Extracted
}

function readExtractedFromValue(value: unknown): Extracted | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { extracted?: Partial<Record<Zb1Feld, string | null>> }
  if (!v.extracted) return null
  const ex = v.extracted
  return Object.fromEntries(ZB1_FELDER.map((f) => [f, ex[f] ?? ''])) as Extracted
}

/**
 * Nutzt den gemeinsamen Helfer aus `@/lib/dokumente/compress-image` — denselben, den der
 * Magic-Link-Upload (`MultiSlotUploadClient`) seit dem HEIC-/Grossfoto-Fix (22.07.) verwendet.
 *
 * ⭐ Genau darin lag die Inkonsistenz: derselbe Kunde, dasselbe Foto, zwei Wege — der
 * Magic-Link komprimierte, der Wizard schickte das Rohbild per `FileReader` durch.
 * Ein eigener Resizer hier waere eine schlechtere Kopie gewesen (kein HEIC, keine
 * EXIF-Orientierung, kein <img>-Fallback).
 */
async function verkleinereBild(file: File): Promise<{ base64: string; mime: string } | null> {
  try {
    const { base64, contentType } = await compressImage(file)
    return { base64, mime: contentType }
  } catch (err) {
    console.error('[zb1-field] Bild-Komprimierung fehlgeschlagen:', err)
    return null
  }
}
