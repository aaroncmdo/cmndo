'use client'

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { saveOnboardingStep } from './saveStep'
import { speichereSvOnboardingStep } from '@/lib/sv-onboarding/save-step'
import { schliesseSvBasicOnboardingAb } from '@/lib/sv-onboarding/finalize'
import { matcheSvFuerWizard, speichereZuordnung } from '@/lib/onboarding/svMatching'
import { reserviereSlot } from '@/lib/onboarding/slots'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { TERMIN_DAUER_MIN } from '@/lib/dispatch/termin-konstanten'
import type { SvMatchResult } from '@/lib/onboarding/svMatching'
import type { OnboardingPhase, OnboardingFeld, ConditionalOn } from './types'
import { wizardStorageKey } from './wizard-storage'
import { FieldRenderer } from './FieldRenderer'
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
      // i18n: nur das Label zurueckgeben — die uebersetzte Meldung baut der
      // Aufrufer per t('pflichtfeld', { label }) (Hook nur in der Komponente).
      return feld.label
    }
  }
  return null
}

interface Props {
  phases: OnboardingPhase[]
  flowKey: string
  /** P5 T8: optionaler Zusatz-Inhalt im Completed-Screen (z.B. Netzwerkpartner-Ask
   *  des sv-onboarding-Wrappers). Ohne Prop rendert der Screen unveraendert. */
  completedExtra?: ReactNode
  // 2026-05-11 Funnel v2 PR #4: vom Loader vorbefuellte Werte. Felder die in
  // prefilledValues vorhanden sind, werden NICHT mehr im Wizard abgefragt
  // (Pflicht-Phasen-Skip passiert schon im Loader; hier ist es nur fuer
  // ggf. wieder editierbar gemachte Optionalfelder relevant).
  prefilledValues?: Record<string, unknown>
  // AAR-zb1-wizard: vom DynamicWizard injizierte Werte für das Zb1UploadField.
  fallId?: string | null
  zb1Token?: string | null
  // token: ehem. /anfrage-self_service_token (beauftragung-Flow, AAR-956 entfernt).
  // Wird noch an FieldRenderer durchgereicht, dort aber ungenutzt (TerminField entfernt)
  // — vestigial; vollständige Entfernung = separater Cleanup (Mounts setzen null/none).
  token?: string | null
}

// AAR-890: flowKey-scoped Storage (Key-Bildung: ./wizard-storage, fall-scoped
// wenn fallId vorliegt) damit parallele Wizards und mehrere Faelle desselben
// Kunden sich nicht gegenseitig ueberschreiben. 7-Tage-TTL gegen Zombie-Wizards.
// localStorage statt sessionStorage damit Tab-Suspend auf Mobile keinen
// Datenverlust verursacht.
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000

type StoredWizardState = {
  anfrageId: string | null
  values: Record<string, unknown>
  phaseKey: string | null
  savedAt: number
}

export function WizardClient({ phases, flowKey, prefilledValues, fallId, zb1Token, token, completedExtra }: Props) {
  const t = useTranslations('onboarding_wizard')
  const tc = useTranslations('common')
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [values, setValues] = useState<Record<string, unknown>>(prefilledValues ?? {})
  const [anfrageId, setAnfrageId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const [svMatch, setSvMatch] = useState<Extract<SvMatchResult, { ok: true }> | null>(null)
  // AAR-890: Restore-Banner-State. Wird beim Mount mit der saved-At-Zeit
  // gesetzt wenn ein gültiger Stand aus localStorage geladen wurde, damit der
  // User explizit "Fortsetzen / Neu starten" wählen kann.
  const [restoredAt, setRestoredAt] = useState<number | null>(null)
  const [hydrated, setHydrated] = useState(false)
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

  // AAR-890: Resume aus localStorage mit TTL-Check + flowKey-Scope. phase_key
  // statt phase_idx damit Phasen-Reorder in der DB (funnel_v2/v3-Migrations)
  // den User nicht auf einer fremden Phase landen lässt. prefilledValues hat
  // Vorrang vor gespeicherten Values für explizit gesetzte Keys — der Loader
  // soll bei Token-Wechsel oder URL-Param-Refresh gewinnen.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(wizardStorageKey(flowKey, fallId))
      if (!raw) { setHydrated(true); return }
      const saved = JSON.parse(raw) as Partial<StoredWizardState>
      const savedAt = typeof saved.savedAt === 'number' ? saved.savedAt : 0
      if (!savedAt || Date.now() - savedAt > STORAGE_TTL_MS) {
        localStorage.removeItem(wizardStorageKey(flowKey, fallId))
        setHydrated(true)
        return
      }
      if (saved.anfrageId) setAnfrageId(saved.anfrageId)
      if (saved.values) {
        // prefilledValues gewinnt für Keys die der Loader explizit gesetzt hat
        setValues({ ...saved.values, ...(prefilledValues ?? {}) })
      }
      if (typeof saved.phaseKey === 'string' && saved.phaseKey.length > 0) {
        const candidatePhases = visiblePhases(phases, { ...saved.values, ...(prefilledValues ?? {}) })
        const idx = candidatePhases.findIndex(p => p.phase_key === saved.phaseKey)
        if (idx >= 0) setPhaseIdx(idx)
      }
      setRestoredAt(savedAt)
    } catch {
      // ignore parse errors
    } finally {
      setHydrated(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowKey, fallId])

  // Persist — erst nach Hydration damit der initial-Render mit prefilledValues
  // nicht den Restore-Pfad überschreibt.
  useEffect(() => {
    if (!hydrated) return
    try {
      const currentPhaseKey = visiblePhases(phases, values)[phaseIdx]?.phase_key ?? null
      const payload: StoredWizardState = {
        anfrageId,
        values,
        phaseKey: currentPhaseKey,
        savedAt: Date.now(),
      }
      localStorage.setItem(wizardStorageKey(flowKey, fallId), JSON.stringify(payload))
    } catch {
      // ignore quota errors
    }
  }, [hydrated, anfrageId, values, phaseIdx, flowKey, fallId, phases])

  // AAR-890: Browser-Back integriert eine Phase zurück, statt die Route zu
  // verlassen. Wir pushen pro Phase einen History-State; popstate dekrementiert
  // phaseIdx wenn möglich. Erste Phase = Browser-Back darf weg navigieren.
  useEffect(() => {
    if (!hydrated) return
    function onPop() {
      setPhaseIdx(i => (i > 0 ? i - 1 : 0))
      setAnimKey(k => k + 1)
      setError(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [hydrated])

  function resetWizard() {
    try { localStorage.removeItem(wizardStorageKey(flowKey, fallId)) } catch {}
    setAnfrageId(null)
    setValues(prefilledValues ?? {})
    setPhaseIdx(0)
    setRestoredAt(null)
    setError(null)
    setAnimKey(k => k + 1)
  }

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

  // sv-onboarding: Token/lead-freier Pfad — schreibt direkt auf sachverstaendige/profiles.
  // Finalize-Erkennung: Phase enthaelt ein Feld mit db_target.tabelle === '_finalize'
  // (das Signatur-Feld hat tabelle='_finalize', spalte='unterschrift').
  async function handleWeiterSvOnboarding(felder: OnboardingFeld[]) {
    if (!currentPhase) return

    const istFinalizPhase = felder.some((f) => f.db_target?.tabelle === '_finalize')

    if (istFinalizPhase) {
      try { localStorage.removeItem(wizardStorageKey(flowKey, fallId)) } catch {}
      const signaturePngDataUri = typeof values['unterschrift'] === 'string'
        ? (values['unterschrift'] as string)
        : ''
      const finalize = await schliesseSvBasicOnboardingAb({ signaturePngDataUri })
      if (!finalize.ok) {
        setError(finalize.error ?? 'Der Abschluss ist fehlgeschlagen. Bitte erneut versuchen.')
        return
      }
      setCompleted(true)
      return
    }

    const r = await speichereSvOnboardingStep(currentPhase.phase_key, values, felder)
    if (!r.ok) {
      setError(r.error ?? 'Speichern fehlgeschlagen. Bitte erneut versuchen.')
      return
    }

    if (phaseIdx >= totalPhases - 1) {
      try { localStorage.removeItem(wizardStorageKey(flowKey, fallId)) } catch {}
      setCompleted(true)
      return
    }

    setPhaseIdx(i => i + 1)
    setAnimKey(k => k + 1)
    try { window.history.pushState({ phaseIdx: phaseIdx + 1 }, '') } catch {}
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleWeiter() {
    if (!currentPhase) return
    const felder = visibleFelder(currentPhase.felder, values)

    const missingLabel = validatePhase(felder, values)
    if (missingLabel) { setError(t('pflichtfeld', { label: missingLabel })); return }
    setError(null)

    setIsSaving(true)
    try {
      // sv-onboarding: Direkt auf sachverstaendige/profiles schreiben;
      // Finalize-Phase schliesst das Basic-Onboarding ab.
      if (flowKey === 'sv-onboarding') {
        await handleWeiterSvOnboarding(felder)
        return
      }

      const result = await saveOnboardingStep(anfrageId, currentPhase.phase_key, values, felder, fallId)
      if (!result.ok) {
        // AAR-890: Anfrage existiert nicht (mehr) — RLS oder DSGVO-Hard-Delete.
        // Wizard resetten statt blind weiterklicken (silent data loss).
        if (result.reason === 'anfrage_not_found') {
          resetWizard()
          setError(t('anfrage_weg'))
          return
        }
        setError(result.error)
        return
      }
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
          // AAR-956 TZ: wunschtermin ist Berlin-Wall-Clock (SlotField makeValue) ->
          // echter UTC-Instant, damit gfa.reservierter_slot_von (Belegt-Check-Quelle)
          // true-UTC ist. Malformed -> Reservierung skippen (fire-and-forget).
          let vonIso: string | null = null
          try {
            vonIso = berlinWallClockToUtc(wunschtermin)
          } catch {
            vonIso = null
          }
          if (vonIso) {
            const vonDate = new Date(vonIso)
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
        try { localStorage.removeItem(wizardStorageKey(flowKey, fallId)) } catch {}
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
        // AAR-956 T1.1b §1c: gutachter-finden-Finalize (Anfrage→Fall via
        // konvertiereAnfrageZuFall) entfernt — der flowKey wurde nie (mehr) gemountet
        // (Marketing-App hat den gutachter-finder-Wizard übernommen), kanonischer
        // Ersatz = /flow → convertLeadToClaim. Dieser generische Pfad bleibt für
        // kunde-onboarding (kein Fall — nur Onboarding-Details + optionale SV-Zuordnung).
        setCompleted(true)
        return
      }
      setPhaseIdx(i => i + 1)
      setAnimKey(k => k + 1)
      // AAR-890: History-State pro Phase → Browser-Back navigiert eine Phase
      // zurück (popstate-Listener oben). Wir nutzen pushState weil wir bewusst
      // KEINE URL-Änderung wollen — der Wizard läuft auf einer Route.
      try { window.history.pushState({ phaseIdx: phaseIdx + 1 }, '') } catch {}
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
          background: 'linear-gradient(135deg, var(--brand-success, #34C759), var(--brand-success, #1a7a35))',
          display: 'grid', placeItems: 'center',
          margin: '0 auto 24px',
          boxShadow: '0 8px 24px rgba(52,199,89,.30)',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M20 6 9 17l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--claimondo-navy)', letterSpacing: '-.024em', marginBottom: 12 }}>
          {t('erfolg_titel')}
        </h2>
        <p style={{ fontSize: 16, color: 'var(--wiz-text-2)', maxWidth: 400, margin: '0 auto 32px', lineHeight: 1.6 }}>
          {t('erfolg_text')}
        </p>

        {/* P5 T8: optionaler Wrapper-Zusatz (sv-onboarding: Netzwerkpartner-Ask). */}
        {completedExtra ? (
          <div style={{ maxWidth: 480, margin: '0 auto 32px', textAlign: 'left' }}>{completedExtra}</div>
        ) : null}

        <div style={{
          display: 'inline-flex', gap: 12, padding: '16px 24px',
          background: 'var(--wiz-fill)', borderRadius: 'var(--wiz-r-lg)',
          fontSize: 14, color: 'var(--wiz-text-2)', fontWeight: 500,
        }}>
          <span>📋</span>
          {t('erfolg_refnr')} <strong style={{ color: 'var(--claimondo-navy)', fontFamily: 'monospace' }}>{anfrageId?.slice(-8).toUpperCase()}</strong>
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
      {/* AAR-890: Restore-Banner — zeigt sich nur wenn beim Mount ein nicht
          abgelaufener Stand aus localStorage geladen wurde. Auto-Resume bleibt
          Default, aber der User sieht explizit dass er fortgesetzt wurde und
          kann mit "Neu starten" abbrechen wenn das nicht gewollt war. */}
      {restoredAt && (
        <RestoreBanner savedAt={restoredAt} onDismiss={() => setRestoredAt(null)} onReset={resetWizard} />
      )}

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
          <CheckCircle2 size={16} style={{ color: 'var(--brand-success, #1a7a35)' }} />
          <span
            className="text-[13px] font-semibold"
            style={{ fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)', color: 'var(--brand-success, #1a7a35)' }}
          >
            {t('sv_naehe')} <strong>{svName}</strong>
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
            token={token}
          />
        ))}
      </div>

      {/* Fehleranzeige — als Glass-Pill in Rosé */}
      {error && (
        <div
          className="rounded-[var(--glass-radius-pill)] px-[22px] py-[14px] [backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)]"
          style={{
            background: 'color-mix(in srgb, white 78%, var(--brand-danger, #F43F5E) 22%)',
            border: '1px solid color-mix(in srgb, white 60%, var(--brand-danger, #F43F5E) 30%)',
            boxShadow: 'var(--glass-shadow)',
            fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
            fontSize: 13.5,
            fontWeight: 600,
            color: 'var(--brand-danger, #9f1239)',
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
            {tc('zurueck')}
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
          {isSaving ? t('speichern_laeuft') : isLast ? t('termin_buchen') : tc('weiter')}
        </GlassButton>
        <span
          className="text-[11px] uppercase tracking-[0.1em] font-bold"
          style={{
            fontFamily: 'var(--font-heading, "Montserrat", system-ui, sans-serif)',
            color: 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 55%, transparent)',
          }}
        >
          {t('oder')}
        </span>
        <BeratungVereinbarenButton />
      </div>
    </div>
  )
}

// FieldRenderer wurde nach ./FieldRenderer.tsx extrahiert (P2a, 2026-06-01) —
// geteilt mit dem flachen Dispatcher-Renderer DispatchLeadForm.

// AAR-890: Restore-Banner. Wird über dem Wizard angezeigt wenn beim Mount ein
// gültiger Stand aus localStorage geladen wurde. Fortsetzen = Banner schließen
// (State ist schon hydratisiert), Neu starten = resetWizard() im Parent.
function RestoreBanner({
  savedAt,
  onDismiss,
  onReset,
}: {
  savedAt: number
  onDismiss: () => void
  onReset: () => void
}) {
  const t = useTranslations('onboarding_wizard')
  const zeit = new Date(savedAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <GlassPill className="self-start gap-3 flex-wrap">
      <span
        className="text-[13px] font-semibold"
        style={{
          fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
          color: 'var(--brand-primary, var(--claimondo-navy))',
        }}
      >
        {t('restore_wiederhergestellt', { zeit })}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[12px] font-semibold underline-offset-2 hover:underline"
        style={{ color: 'var(--brand-primary, var(--claimondo-navy))' }}
      >
        {t('restore_fortsetzen')}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="text-[12px] font-semibold underline-offset-2 hover:underline"
        style={{ color: 'var(--brand-danger, #9f1239)' }}
      >
        {t('restore_neustarten')}
      </button>
    </GlassPill>
  )
}
