'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { saveOnboardingStep } from './saveStep'
import { finalizeGutachterFinderAnfrage } from './finalizeAnfrage'
import { matcheSvFuerWizard, speichereZuordnung } from '@/lib/onboarding/svMatching'
import type { SvMatchResult } from '@/lib/onboarding/svMatching'
import type { OnboardingPhase, OnboardingFeld, ConditionalOn } from './types'
import { TextField } from './fields/TextField'
import { TextareaField } from './fields/TextareaField'
import { SegmentedField } from './fields/SegmentedField'
import { ToggleCardsField } from './fields/ToggleCardsField'
import { SelectField } from './fields/SelectField'
import { CheckboxField } from './fields/CheckboxField'
import { SlotField } from './fields/SlotField'
import { SignatureField } from './fields/SignatureField'
import { FileField } from './fields/FileField'

function meetsCondition(cond: ConditionalOn | null | undefined, vals: Record<string, unknown>) {
  if (!cond) return true
  return String(vals[cond.feld] ?? '') === cond.equals
}

function visiblePhases(phases: OnboardingPhase[], vals: Record<string, unknown>) {
  return phases.filter(p => meetsCondition(p.conditional_on, vals))
}

function visibleFelder(felder: OnboardingFeld[], vals: Record<string, unknown>) {
  return felder.filter(f => meetsCondition(f.conditional_on, vals))
}

function validatePhase(felder: OnboardingFeld[], vals: Record<string, unknown>): string | null {
  for (const feld of felder) {
    if (!feld.pflicht) continue
    if (!meetsCondition(feld.conditional_on, vals)) continue
    const val = vals[feld.feld_key]
    if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
      return `"${feld.label}" ist ein Pflichtfeld`
    }
  }
  return null
}

interface Props {
  phases: OnboardingPhase[]
  flowKey: string
}

const STORAGE_KEY = 'claimondo-wizard-state'

export function WizardClient({ phases, flowKey }: Props) {
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [anfrageId, setAnfrageId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const [svMatch, setSvMatch] = useState<Extract<SvMatchResult, { ok: true }> | null>(null)
  // 2026-05-11: SV-Pre-Selection ueber DOM-Event aus der Mapbox-Karte
  // (GutachterFinderMapClient). Wird beim Finalize an speichereZuordnung
  // weitergereicht damit der gewaehlte SV-Lead im konvertierten Lead landet.
  const [preSelectedSvLeadId, setPreSelectedSvLeadId] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const geoMatchedRef = useRef(false)
  const svId = svMatch?.svId ?? null
  const svName = svMatch?.svName ?? null

  // 2026-05-11: Click auf einen SV-Marker in der Karte sendet ein
  // claimondo:select-sv CustomEvent mit der sv_leads.id. Wir merken sie
  // uns und reichen sie beim Finalize an speichereZuordnung weiter.
  useEffect(() => {
    function handleSelect(e: Event) {
      const ce = e as CustomEvent<string>
      if (typeof ce.detail === 'string' && ce.detail.length > 0) {
        setPreSelectedSvLeadId(ce.detail)
      }
    }
    document.addEventListener('claimondo:select-sv', handleSelect)
    return () => document.removeEventListener('claimondo:select-sv', handleSelect)
  }, [])

  // Resume-Support: anfrageId + werte aus sessionStorage laden
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { anfrageId: string; values: Record<string, unknown>; phaseIdx: number }
        if (saved.anfrageId) setAnfrageId(saved.anfrageId)
        if (saved.values) setValues(saved.values)
        if (typeof saved.phaseIdx === 'number') setPhaseIdx(saved.phaseIdx)
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ anfrageId, values, phaseIdx }))
    } catch {
      // ignore quota errors
    }
  }, [anfrageId, values, phaseIdx])

  const currentPhases = visiblePhases(phases, values)
  const totalPhases = currentPhases.length
  const currentPhase = currentPhases[phaseIdx]

  // Sobald eine Phase mit 'slot'-Feld aktiv wird → Browser-Geolocation + SV-Matching
  const hasSlotFeld = currentPhase?.felder.some(f => f.typ === 'slot') ?? false
  useEffect(() => {
    if (!hasSlotFeld || geoMatchedRef.current || svId) return
    if (!navigator.geolocation) return
    geoMatchedRef.current = true
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const result = await matcheSvFuerWizard(pos.coords.latitude, pos.coords.longitude)
        if (result.ok) setSvMatch(result)
      },
      () => { /* Standort verweigert — SlotField zeigt Demo-Slots */ },
      { timeout: 8000, maximumAge: 60_000 },
    )
  }, [hasSlotFeld, svId])

  const setField = useCallback((key: string, val: unknown) => {
    setValues(prev => ({ ...prev, [key]: val }))
  }, [])

  async function handleWeiter() {
    if (!currentPhase) return
    const felder = visibleFelder(currentPhase.felder, values)

    const validErr = validatePhase(felder, values)
    if (validErr) { setError(validErr); return }
    setError(null)

    setIsSaving(true)
    try {
      const result = await saveOnboardingStep(anfrageId, currentPhase.phase_key, values, felder)
      if (!result.ok) { setError(result.error); return }
      setAnfrageId(result.anfrageId)

      if (phaseIdx >= totalPhases - 1) {
        sessionStorage.removeItem(STORAGE_KEY)
        // SV- oder Lead-Zuordnung auf GFA persistieren (fire-and-forget, unkritisch)
        // Reihenfolge: User-Klick auf Karte hat Vorrang vor Auto-Geo-Matching.
        if (preSelectedSvLeadId) {
          speichereZuordnung(result.anfrageId, {
            ok: true,
            typ: 'lead',
            svId: null,
            svLeadId: preSelectedSvLeadId,
            svName: '',
            distanzKm: 0,
          }).catch(() => {})
        } else if (svMatch) {
          speichereZuordnung(result.anfrageId, svMatch).catch(() => {})
        }
        // Finalize: Anfrage → Fall + Magic-Link. Nur für gutachter-finden Flow,
        // andere Flows (z. B. SV-Onboarding) nutzen den Wizard ebenfalls und
        // brauchen keine Konvertierung in einen Schadensfall.
        if (flowKey === 'gutachter-finden') {
          const finalize = await finalizeGutachterFinderAnfrage(result.anfrageId)
          if (!finalize.ok) {
            // Anfrage liegt als status='entwurf' in der DB — Dispatch sieht sie
            // und kann manuell konvertieren. Trotzdem completed=true damit der
            // Kunde Bestätigung sieht.
            console.error('[WizardClient] Finalize fehlgeschlagen:', finalize.error)
          }
        }
        setCompleted(true)
        return
      }
      setPhaseIdx(i => i + 1)
      setAnimKey(k => k + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setIsSaving(false)
    }
  }

  function handleZurueck() {
    if (phaseIdx === 0) return
    setPhaseIdx(i => i - 1)
    setAnimKey(k => k + 1)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (completed) {
    return (
      <div style={{
        fontFamily: 'var(--font-montserrat, Montserrat), sans-serif',
        textAlign: 'center',
        padding: 'clamp(48px, 8vw, 80px) 24px',
        animation: 'sheetIn .5s var(--wiz-ease-out) both',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'linear-gradient(135deg, #34C759, #1a7a35)',
          display: 'grid', placeItems: 'center',
          margin: '0 auto 24px',
          boxShadow: '0 8px 24px rgba(52,199,89,.30)',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M20 6 9 17l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--claimondo-navy)', letterSpacing: '-.024em', marginBottom: 12 }}>
          Termin erfolgreich angefragt!
        </h2>
        <p style={{ fontSize: 16, color: 'var(--wiz-text-2)', maxWidth: 400, margin: '0 auto 32px', lineHeight: 1.6 }}>
          Ihr Sachverständiger wird sich in Kürze bei Ihnen melden, um den Termin zu bestätigen.
        </p>
        <div style={{
          display: 'inline-flex', gap: 12, padding: '16px 24px',
          background: 'var(--wiz-fill)', borderRadius: 'var(--wiz-r-lg)',
          fontSize: 14, color: 'var(--wiz-text-2)', fontWeight: 500,
        }}>
          <span>📋</span>
          Ihre Referenznummer: <strong style={{ color: 'var(--claimondo-navy)', fontFamily: 'monospace' }}>{anfrageId?.slice(-8).toUpperCase()}</strong>
        </div>
      </div>
    )
  }

  if (!currentPhase) return null

  const felder = visibleFelder(currentPhase.felder, values)
  const progress = totalPhases > 1 ? phaseIdx / (totalPhases - 1) : 1
  const isLast = phaseIdx >= totalPhases - 1

  return (
    <div style={{ fontFamily: 'var(--font-montserrat, Montserrat), sans-serif' }}>
      {/* Step-Rail */}
      <div style={{
        background: '#fff',
        borderRadius: 'var(--wiz-r-xl)',
        padding: '22px 26px 24px',
        marginBottom: 24,
        boxShadow: 'var(--wiz-shadow-2)',
        position: 'relative',
      }}>
        {/* Verbindungslinie Hintergrund */}
        <div style={{
          position: 'absolute', top: 41, left: '11%', right: '11%',
          height: 3, borderRadius: 2,
          background: 'var(--wiz-fill)',
          zIndex: 0,
        }} />
        {/* Aktiver Fortschritt */}
        <div style={{
          position: 'absolute', top: 41, left: '11%',
          height: 3, borderRadius: 2, zIndex: 1,
          background: 'linear-gradient(90deg, var(--claimondo-navy), var(--claimondo-ondo))',
          width: `${progress * 78}%`,
          transition: 'width .55s var(--wiz-ease-out)',
        }} />
        {/* Schritt-Kreise */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${totalPhases}, 1fr)`,
          position: 'relative', zIndex: 2,
        }}>
          {currentPhases.map((phase, i) => {
            const isDone = i < phaseIdx
            const isActive = i === phaseIdx
            return (
              <div key={phase.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: isDone ? 'var(--claimondo-navy)' : isActive ? 'var(--claimondo-ondo)' : '#fff',
                  border: `2px solid ${isDone ? 'var(--claimondo-navy)' : isActive ? 'var(--claimondo-ondo)' : 'var(--wiz-fill)'}`,
                  color: isDone || isActive ? '#fff' : 'var(--wiz-text-3)',
                  display: 'grid', placeItems: 'center',
                  fontWeight: 600, fontSize: 15, letterSpacing: '-.01em',
                  transition: 'all .35s var(--wiz-ease)',
                  transform: isDone ? 'scale(1.04)' : isActive ? 'scale(1.06)' : 'scale(1)',
                  boxShadow: isActive ? '0 0 0 6px rgba(69,115,162,.16)' : 'none',
                }}>
                  {isDone ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span style={{
                  marginTop: 12,
                  fontSize: 12, fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--claimondo-navy)' : isDone ? 'var(--wiz-text-2)' : 'var(--wiz-text-3)',
                  letterSpacing: '-.005em',
                  transition: 'color .25s var(--wiz-ease)',
                }}>
                  {phase.titel}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Phase-Card mit Sheet-Animation */}
      <div
        key={animKey}
        style={{
          background: '#fff',
          borderRadius: 'var(--wiz-r-2xl)',
          padding: '36px clamp(22px, 3vw, 40px)',
          boxShadow: 'var(--wiz-shadow-3)',
          animation: 'sheetIn .42s var(--wiz-ease-out) both',
        }}
      >
        {/* Phase-Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 24, marginBottom: 32, paddingBottom: 28,
          borderBottom: '1px solid var(--wiz-separator)',
        }}>
          <div>
            {currentPhase.eyebrow && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                fontSize: 13, fontWeight: 600, color: 'var(--claimondo-ondo)',
                letterSpacing: '-.005em', marginBottom: 6,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--claimondo-ondo)', display: 'inline-block' }} />
                {currentPhase.eyebrow}
              </div>
            )}
            <h2 style={{
              fontSize: 24, fontWeight: 700, letterSpacing: '-.024em',
              color: 'var(--claimondo-navy)', lineHeight: 1.18, marginTop: 0,
            }}>
              {currentPhase.titel}
            </h2>
            {currentPhase.beschreibung && (
              <p style={{
                marginTop: 10, fontSize: 15, color: 'var(--wiz-text-2)',
                lineHeight: 1.55, maxWidth: 480, letterSpacing: '-.005em',
              }}>
                {currentPhase.beschreibung}
              </p>
            )}
          </div>
          <div style={{
            flexShrink: 0,
            fontSize: 13, fontWeight: 600, color: 'var(--wiz-text-2)',
            background: 'var(--wiz-fill)', borderRadius: 999, padding: '8px 14px',
            letterSpacing: '-.005em', whiteSpace: 'nowrap',
          }}>
            <strong style={{ color: 'var(--claimondo-navy)', fontWeight: 700 }}>{phaseIdx + 1}</strong>
            {' / '}{totalPhases}
          </div>
        </div>

        {/* SV-Match-Banner wenn Slot-Phase aktiv + SV gefunden */}
        {hasSlotFeld && svName && (
          <div style={{
            marginBottom: 20, padding: '12px 18px',
            background: 'rgba(52,199,89,.08)', borderRadius: 'var(--wiz-r-sm)',
            fontSize: 14, fontWeight: 500, color: '#1a7a35', letterSpacing: '-.005em',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sachverständiger in Ihrer Nähe gefunden: <strong>{svName}</strong>
          </div>
        )}

        {/* Felder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {felder.map(feld => (
            <FieldRenderer
              key={feld.id}
              feld={feld}
              value={values[feld.feld_key]}
              onChange={val => setField(feld.feld_key, val)}
              disabled={isSaving}
              svId={svId}
              anfrageId={anfrageId}
            />
          ))}
        </div>

        {/* Fehleranzeige */}
        {error && (
          <div style={{
            marginTop: 20, padding: '14px 18px',
            background: 'rgba(255,59,48,.08)',
            borderRadius: 'var(--wiz-r-sm)',
            fontSize: 14, fontWeight: 500,
            color: '#c0392b', letterSpacing: '-.005em',
          }}>
            {error}
          </div>
        )}

        {/* Phase-Footer */}
        <div style={{
          marginTop: 32, paddingTop: 24,
          borderTop: '1px solid var(--wiz-separator)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <button
            type="button"
            disabled={phaseIdx === 0 || isSaving}
            onClick={handleZurueck}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 22px', borderRadius: 999,
              fontSize: 15, fontWeight: 600, letterSpacing: '-.01em',
              background: 'var(--wiz-fill)', color: 'var(--claimondo-navy)',
              border: 'none', cursor: phaseIdx === 0 ? 'not-allowed' : 'pointer',
              opacity: phaseIdx === 0 ? .35 : 1,
              transition: 'all .25s var(--wiz-ease)',
              fontFamily: 'inherit',
              minHeight: 48,
            }}
          >
            <ChevronLeft size={18} />
            Zurück
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleWeiter}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 26px', borderRadius: 999,
              fontSize: 15, fontWeight: 600, letterSpacing: '-.01em',
              background: 'var(--claimondo-ondo)', color: '#fff',
              border: 'none', cursor: isSaving ? 'wait' : 'pointer',
              boxShadow: '0 4px 12px rgba(69,115,162,.30), 0 1px 2px rgba(69,115,162,.18)',
              transition: 'all .25s var(--wiz-ease)',
              fontFamily: 'inherit',
              minHeight: 48,
              opacity: isSaving ? .7 : 1,
            }}
          >
            {isSaving ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
                Speichern…
              </>
            ) : isLast ? (
              <>
                Termin buchen
                <ChevronRight size={18} />
              </>
            ) : (
              <>
                Weiter
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldRenderer({
  feld,
  value,
  onChange,
  disabled,
  svId,
  anfrageId,
}: {
  feld: OnboardingFeld
  value: unknown
  onChange: (val: unknown) => void
  disabled: boolean
  svId?: string | null
  anfrageId?: string | null
}) {
  switch (feld.typ) {
    case 'text':
    case 'email':
    case 'tel':
    case 'number':
      return (
        <TextField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'textarea':
      return (
        <TextareaField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'segmented':
      return (
        <SegmentedField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'toggle-cards':
      return (
        <ToggleCardsField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'select':
      return (
        <SelectField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'checkbox':
      return (
        <CheckboxField
          feld={feld}
          value={(value as boolean) ?? false}
          onChange={onChange as (v: boolean) => void}
          disabled={disabled}
        />
      )
    case 'slot':
      return (
        <SlotField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
          svId={svId}
          // 2026-05-11 Funnel v2: SlotField ist Tier-aware. preSelectedSvLeadId
          // kommt von der Karten-Auswahl (claimondo:select-sv Event).
          svLeadId={preSelectedSvLeadId}
          anfrageId={anfrageId}
        />
      )
    case 'signature':
      return (
        <SignatureField
          feld={feld}
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          disabled={disabled}
        />
      )
    case 'file':
      return (
        <FileField
          feld={feld}
          value={(value as string[]) ?? []}
          onChange={onChange as (v: string[]) => void}
          disabled={disabled}
        />
      )
    default:
      return null
  }
}
