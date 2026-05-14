'use client'

// AAR-zb1-wizard: Kamera-basierter Fahrzeugschein-Upload mit OCR + editierbarer Preview.
//
// Zustands-Maschine: idle → uploading → preview (editierbar) → confirmed
// Fehler-Zweig:     uploading → error → idle (Retry) … nach 2 Fails: Skip-Link
//
// Daten-Flow:
//   1. Foto via <input capture="environment"> oder Galerie
//   2. base64 → uploadDokumentViaAnfrageToken(token, 'fahrzeugschein', base64)
//   3. OCR + leads-Update läuft serverseitig (H6-Regel, schreibt nur leere Felder)
//   4. extracted-Payload prefilled Preview-Inputs
//   5. Kunde editiert/bestätigt → onChange triggert ggf. confirmZb1Korrekturen

import { useRef, useState } from 'react'
import type { OnboardingFeld } from '../types'
import { uploadDokumentViaAnfrageToken } from '@/app/upload/dokumente/[token]/actions'
import { confirmZb1Korrekturen, clearZb1Felder } from '@/app/kunde/onboarding-details/zb1-actions'

type Status = 'idle' | 'uploading' | 'preview' | 'error' | 'skipped'

type Extracted = {
  kennzeichen: string
  fahrzeug_hersteller: string
  fahrzeug_modell: string
  halter_name: string
}

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
      setErrorMsg('Upload-Token fehlt. Bitte Seite neu laden.')
      return
    }
    setStatus('uploading')
    setErrorMsg(null)

    const base64 = await fileToBase64(file)
    if (!base64) {
      setStatus('error')
      setErrorMsg('Foto konnte nicht gelesen werden.')
      return
    }

    const res = await uploadDokumentViaAnfrageToken(token, 'fahrzeugschein', base64, file.type || 'image/jpeg')
    if (!res.success) {
      setVersuche(v => v + 1)
      setStatus('error')
      setErrorMsg(res.error ?? 'OCR fehlgeschlagen — bitte erneut versuchen.')
      return
    }

    const ex: Extracted = {
      kennzeichen: res.extracted?.kennzeichen ?? '',
      fahrzeug_hersteller: res.extracted?.fahrzeug_hersteller ?? '',
      fahrzeug_modell: res.extracted?.fahrzeug_modell ?? '',
      halter_name: res.extracted?.halter_name ?? '',
    }
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
    const diff: Parameters<typeof confirmZb1Korrekturen>[1] = {}
    if (edit.kennzeichen !== extracted.kennzeichen) diff.kennzeichen = edit.kennzeichen || null
    if (edit.fahrzeug_hersteller !== extracted.fahrzeug_hersteller) diff.fahrzeug_hersteller = edit.fahrzeug_hersteller || null
    if (edit.fahrzeug_modell !== extracted.fahrzeug_modell) diff.fahrzeug_modell = edit.fahrzeug_modell || null
    if (edit.halter_name !== extracted.halter_name) diff.halter_name = edit.halter_name || null

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
          <Spinner /> Foto wird ausgewertet …
        </div>
      )}

      {status === 'error' && errorMsg && (
        <div style={infoBoxStyle('error')}>{errorMsg}</div>
      )}

      {status === 'error' && versuche >= MAX_VERSUCHE && (
        <button type="button" onClick={handleSkip} style={skipLinkStyle}>
          Daten später manuell eingeben →
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
          Übersprungen. Wir fragen die Daten später nochmal beim Service-Mitarbeiter ab.
        </div>
      )}
    </div>
  )
}

// ─── Sub-Components ───────────────────────────────────────────────────

function CaptureButtons({ disabled, onCamera, onGallery }: { disabled: boolean; onCamera: () => void; onGallery: () => void }) {
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
        Fahrzeugschein fotografieren
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
        oder Foto aus Galerie wählen
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
        ✓ Daten ausgelesen — bitte prüfen und ggf. korrigieren
      </div>
      <EditRow label="Kennzeichen" value={edit.kennzeichen} onChange={v => onChange({ ...edit, kennzeichen: v })} />
      <EditRow label="Hersteller" value={edit.fahrzeug_hersteller} onChange={v => onChange({ ...edit, fahrzeug_hersteller: v })} />
      <EditRow label="Modell" value={edit.fahrzeug_modell} onChange={v => onChange({ ...edit, fahrzeug_modell: v })} />
      <EditRow label="Halter" value={edit.halter_name} onChange={v => onChange({ ...edit, halter_name: v })} />
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
          Neu fotografieren
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
          Übernehmen
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
  return { kennzeichen: '', fahrzeug_hersteller: '', fahrzeug_modell: '', halter_name: '' }
}

function readExtractedFromValue(value: unknown): Extracted | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { extracted?: Partial<Extracted> }
  if (!v.extracted) return null
  return {
    kennzeichen: v.extracted.kennzeichen ?? '',
    fahrzeug_hersteller: v.extracted.fahrzeug_hersteller ?? '',
    fahrzeug_modell: v.extracted.fahrzeug_modell ?? '',
    halter_name: v.extracted.halter_name ?? '',
  }
}

async function fileToBase64(file: File): Promise<string | null> {
  try {
    const reader = new FileReader()
    return await new Promise((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string
        const idx = result.indexOf(',')
        resolve(idx >= 0 ? result.slice(idx + 1) : result)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  } catch {
    return null
  }
}
