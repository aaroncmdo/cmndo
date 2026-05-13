'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { saveOnboardingStep } from './saveStep'
import { finalizeGutachterFinderAnfrage } from './finalizeAnfrage'
import { matcheSvFuerWizard, speichereZuordnung } from '@/lib/onboarding/svMatching'
import { reserviereSlot } from '@/lib/onboarding/slots'
import { TERMIN_DAUER_MIN } from '@/lib/dispatch/termin-konstanten'
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
import { Zb1UploadField } from './fields/Zb1UploadField'
// AAR-glass-s1: Liquid-Glass-Design-System.
import { GlassPill, GlassButton, GlassStepIndicator, BeratungVereinbarenButton } from '@/components/shared/glass'

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
  // 2026-05-11 Funnel v2 PR #4: vom Loader vorbefuellte Werte. Felder die in
  // prefilledValues vorhanden sind, werden NICHT mehr im Wizard abgefragt
  // (Pflicht-Phasen-Skip passiert schon im Loader; hier ist es nur fuer
  // ggf. wieder editierbar gemachte Optionalfelder relevant).
  prefilledValues?: Record<string, unknown>
  // AAR-zb1-wizard: vom DynamicWizard injizierte Werte für das Zb1UploadField.
  fallId?: string | null
  zb1Token?: string | null
}

const STORAGE_KEY = 'claimondo-wizard-state'

export function WizardClient({ phases, flowKey, prefilledValues, fallId, zb1Token }: Props) {
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [values, setValues] = useState<Record<string, unknown>>(prefilledValues ?? {})
  const [anfrageId, setAnfrageId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const [svMatch, setSvMatch] = useState<Extract<SvMatchResult, { ok: true }> | null>(null)
  // 2026-05-11 → 2026-05-13: SV-Pre-Selection via DOM-Event. Event-Detail ist
  // jetzt { id, tier } — Tier 'premium' = sachverstaendige.id → svId,
  // Tier 'lead' = sv_leads.id → svLeadId. Alte String-Form (Tier 3) bleibt
  // backward-kompatibel als Fallback.
  const [preSelectedSvId, setPreSelectedSvId] = useState<string | null>(null)
  const [preSelectedSvLeadId, setPreSelectedSvLeadId] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const geoMatchedRef = useRef(false)
  // Priorität: Karten-Click (preSelectedSvId) vor Geo-Auto-Match (svMatch).
  const svId = preSelectedSvId ?? svMatch?.svId ?? null
  const svName = svMatch?.svName ?? null

  useEffect(() => {
    function handleSelect(e: Event) {
      const ce = e as CustomEvent<unknown>
      const detail = ce.detail
      if (typeof detail === 'object' && detail !== null && 'id' in detail && 'tier' in detail) {
        const { id, tier } = detail as { id: string; tier: 'premium' | 'lead' }
        if (typeof id !== 'string' || id.length === 0) return
        if (tier === 'premium') {
          setPreSelectedSvId(id)
          setPreSelectedSvLeadId(null)
        } else {
          setPreSelectedSvLeadId(id)
          setPreSelectedSvId(null)
        }
      } else if (typeof detail === 'string' && detail.length > 0) {
        // Backward-Compat: alte String-Form (immer als sv_lead behandelt)
        setPreSelectedSvLeadId(detail)
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

      // 2026-05-13: Slot-Phase-Submit → reserviereSlot fire-and-forget.
      // Idempotenz liegt in reserviereSlot selbst (vorheriger Termin wird
      // auf 'abgelehnt' gesetzt bevor neuer eingefuegt wird). Fehler werden
      // bewusst geschluckt — Reservierung ist Nice-to-have, finalize laeuft
      // auch ohne. Cron slot-ttl-cleanup raeumt verwaiste auf.
      const hatSlotFeld = felder.some(f => f.typ === 'slot')
      const wunschtermin = values['wunschtermin']
      if (hatSlotFeld && typeof wunschtermin === 'string' && wunschtermin.length > 0) {
        const effSvId = preSelectedSvId ?? svMatch?.svId ?? null
        const effSvLeadId = effSvId ? null : preSelectedSvLeadId
        if (effSvId || effSvLeadId) {
          const vonDate = new Date(wunschtermin)
          if (!Number.isNaN(vonDate.getTime())) {
            const bisDate = new Date(vonDate.getTime() + TERMIN_DAUER_MIN * 60_000)
            reserviereSlot(
              result.anfrageId,
              effSvId ?? '',
              vonDate.toISOString(),
              bisDate.toISOString(),
              effSvLeadId,
            ).catch((err) => {
              console.error('[WizardClient] reserviereSlot fehlgeschlagen:', err)
            })
          }
        }
      }

      if (phaseIdx >= totalPhases - 1) {
        sessionStorage.removeItem(STORAGE_KEY)
        // SV-/Lead-Zuordnung auf GFA persistieren (fire-and-forget, unkritisch).
        // Priorität: Karten-Click (premium > lead) vor Auto-Geo-Matching.
        if (preSelectedSvId) {
          speichereZuordnung(result.anfrageId, {
            ok: true,
            typ: 'sv',
            svId: preSelectedSvId,
            svLeadId: null,
            svName: svMatch?.svName ?? '',
            distanzKm: 0,
          }).catch(() => {})
        } else if (preSelectedSvLeadId) {
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
  const isLast = phaseIdx >= totalPhases - 1

  return (
    <div
      key={animKey}
      style={{
        fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        animation: 'sheetIn .42s var(--wiz-ease-out) both',
      }}
    >
      {/* AAR-glass-s1: Step-Indicator als kompakte Glass-Pill statt großer Card */}
      <GlassStepIndicator current={phaseIdx + 1} total={totalPhases} className="self-start" />

      {/* Phase-Header — freischwebend, kein Card-Wrapper. Die Phase-Eyebrow
          ("Schritt N von M") wird NICHT mehr gerendert — der GlassStepIndicator
          oben zeigt den Schritt-Stand, ein zweiter Counter wäre redundant. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2
          style={{
            fontFamily: 'var(--font-heading, "Montserrat", system-ui, sans-serif)',
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '-.024em',
            lineHeight: 1.08,
            margin: 0,
            color: 'var(--brand-primary, var(--claimondo-navy))',
            textShadow: '0 1px 0 rgba(255,255,255,.7), 0 0 20px rgba(255,255,255,.4)',
          }}
        >
          {currentPhase.titel}
        </h2>
        {currentPhase.beschreibung && (
          <p
            style={{
              fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
              fontSize: 14.5,
              fontWeight: 500,
              lineHeight: 1.55,
              maxWidth: 480,
              margin: 0,
              color: 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 65%, transparent)',
              textShadow: '0 1px 0 rgba(255,255,255,.5)',
            }}
          >
            {currentPhase.beschreibung}
          </p>
        )}
      </div>

      {/* SV-Match-Banner als Glass-Pill wenn Slot-Phase aktiv + SV gefunden */}
      {hasSlotFeld && svName && (
        <GlassPill className="self-start gap-2.5">
          <CheckCircle2 size={16} style={{ color: '#1a7a35' }} />
          <span
            className="text-[13px] font-semibold"
            style={{ fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)', color: '#1a7a35' }}
          >
            Sachverständiger in Ihrer Nähe: <strong>{svName}</strong>
          </span>
        </GlassPill>
      )}

      {/* Felder — jedes Feld ist eine eigene Glass-Pill (siehe FieldRenderer) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {felder.map(feld => (
          <FieldRenderer
            key={feld.id}
            feld={feld}
            value={values[feld.feld_key]}
            onChange={val => setField(feld.feld_key, val)}
            disabled={isSaving}
            svId={svId}
            anfrageId={anfrageId}
            preSelectedSvLeadId={preSelectedSvLeadId}
            fallId={fallId}
            zb1Token={zb1Token}
          />
        ))}
      </div>

      {/* Fehleranzeige — als Glass-Pill in Rosé */}
      {error && (
        <div
          className="rounded-[var(--glass-radius-pill)] px-[22px] py-[14px] [backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)]"
          style={{
            background: 'color-mix(in srgb, white 78%, #F43F5E 22%)',
            border: '1px solid color-mix(in srgb, white 60%, #F43F5E 30%)',
            boxShadow: 'var(--glass-shadow)',
            fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
            fontSize: 13.5,
            fontWeight: 600,
            color: '#9f1239',
          }}
        >
          {error}
        </div>
      )}

      {/* Footer — Glass-Button-Reihe: Zurück (secondary) + Weiter/Buchen (cta) + Beratung */}
      <div className="flex items-center gap-3 flex-wrap mt-1">
        {phaseIdx > 0 && (
          <GlassButton
            variant="secondary"
            icon={<ChevronLeft size={16} strokeWidth={2.2} />}
            iconPosition="left"
            onClick={handleZurueck}
            disabled={isSaving}
          >
            Zurück
          </GlassButton>
        )}
        <GlassButton
          variant="cta"
          data-testid="wizard-weiter"
          data-phase-idx={phaseIdx}
          data-is-last={isLast}
          icon={
            isSaving ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="10" strokeLinecap="round" />
              </svg>
            ) : (
              <ChevronRight size={16} strokeWidth={2.2} />
            )
          }
          iconPosition="right"
          onClick={handleWeiter}
          disabled={isSaving}
        >
          {isSaving ? 'Speichern…' : isLast ? 'Termin buchen' : 'Weiter'}
        </GlassButton>
        <span
          className="text-[11px] uppercase tracking-[0.1em] font-bold"
          style={{
            fontFamily: 'var(--font-heading, "Montserrat", system-ui, sans-serif)',
            color: 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 55%, transparent)',
          }}
        >
          oder
        </span>
        <BeratungVereinbarenButton />
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
  preSelectedSvLeadId,
  fallId,
  zb1Token,
}: {
  feld: OnboardingFeld
  value: unknown
  onChange: (val: unknown) => void
  disabled: boolean
  svId?: string | null
  anfrageId?: string | null
  preSelectedSvLeadId?: string | null
  fallId?: string | null
  zb1Token?: string | null
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
    case 'zb1-upload':
      return (
        <Zb1UploadField
          feld={feld}
          value={value}
          onChange={onChange}
          disabled={disabled}
          token={zb1Token ?? null}
          fallId={fallId ?? null}
        />
      )
    default:
      return null
  }
}
