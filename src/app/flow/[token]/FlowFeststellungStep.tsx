'use client'

// AAR-956 P4-A + 15.06. (Aaron): ① Feststellung als Micro-Step-Wizard statt
// langem Scroll. Eine Frage pro Screen, Kapitel-Eyebrow + Sub-Fortschritt +
// Zurück/Weiter. Gruppierung in feststellung-steps.ts (Config-Reihenfolge,
// bedingte Schritte fallen raus). Felder aus der lead-erfassung-Config via dem
// geteilten FieldRenderer; nichts ist Pflicht ("vorerst überspringen").
//
// Speichern: pro Schritt Hintergrund-Autosave (best effort → Resume + Realtime-
// Refresh), am letzten Schritt blockierend (garantiert vor dem Outer-Wizard-
// Wechsel). ZB1-OCR füllt Fahrzeug/Halter in die lokalen values (handleZb1Extracted)
// inkl. Name-Match auf ist_fahrzeughalter (Kunde == Halter → Halter-Block entfällt).

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { OnboardingPhase, OnboardingFeld, ConditionalOn } from '@/components/onboarding/types'
import { FieldRenderer } from '@/components/onboarding/FieldRenderer'
import { istFeststellungsFeld, istDokumentManuellFeld } from '@/lib/self-service/feststellung-felder'
import { speichereFeststellungFlow } from './self-service-feststellung-actions'
import { FlowZb1Upload, type Zb1FlowExtracted } from './FlowZb1Upload'
import { FlowPolizeiberichtUpload } from './FlowPolizeiberichtUpload'
import { FESTSTELLUNG_STEPS } from './feststellung-steps'
import { Button } from '@/components/primitives/Button/Button.web'

// Spiegelt WizardClient.meetsCondition: sichtbar wenn keine Bedingung gesetzt ist
// oder der aktuelle Wert des Bedingungsfelds exakt passt (String-Vergleich).
function meetsCondition(cond: ConditionalOn | null | undefined, vals: Record<string, unknown>): boolean {
  if (!cond) return true
  return String(vals[cond.feld] ?? '') === cond.equals
}

const istLeer = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

// Konservativer Name-Match: Nachname exakt + Vorname kompatibel (exakt/Präfix).
// Entscheidet, ob der OCR-Halter == der Kunde ist (→ kein Halter-Sub-Block).
function namensMatch(ocrVor: string | null, ocrNach: string | null, kundeVor: unknown, kundeNach: unknown): boolean {
  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const on = norm(ocrNach)
  const kn = norm(kundeNach)
  if (!on || !kn || on !== kn) return false
  const ov = norm(ocrVor)
  const kv = norm(kundeVor)
  if (!ov || !kv) return true
  return ov === kv || ov.startsWith(kv) || kv.startsWith(ov)
}

export function FlowFeststellungStep({
  token,
  phasen,
  initialValues,
  onWeiter,
}: {
  token: string
  phasen: OnboardingPhase[]
  initialValues: Record<string, unknown>
  onWeiter: () => void
}) {
  const t = useTranslations('flow')
  const [values, setValues] = useState<Record<string, unknown>>(initialValues)
  const [microIndex, setMicroIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showManuell, setShowManuell] = useState(false)

  // feld_key -> sichtbares ①-Feststellungsfeld (audience kunde schon via ladeFlowPhasen).
  const felderByKey = useMemo(() => {
    const m = new Map<string, OnboardingFeld>()
    for (const p of phasen) for (const f of p.felder) if (istFeststellungsFeld(f)) m.set(f.feld_key, f)
    return m
  }, [phasen])

  // OCR-Folgedaten (Fahrzeug-ID), die der Kunde OHNE Foto manuell eintippen kann —
  // nur die noch leeren, dedupet je feld_key. Leben im ZB1-Schritt als Fallback.
  const dokumentFelder = useMemo(
    () =>
      Array.from(
        new Map(phasen.flatMap((p) => p.felder).filter(istDokumentManuellFeld).map((f) => [f.feld_key, f])).values(),
      ).filter((f) => istLeer(initialValues[f.feld_key])),
    [phasen, initialValues],
  )

  const fahrzeugErfasst = ['kennzeichen', 'fin', 'fahrzeug_hersteller'].some((k) => !istLeer(initialValues[k]))

  // Aktive Schritte (reaktiv auf values): felder-Schritt sichtbar wenn >=1 Feld
  // sichtbar, polizeibericht nur bei Polizei vor Ort, zb1 immer.
  const activeSteps = useMemo(
    () =>
      FESTSTELLUNG_STEPS.filter((step) => {
        if (step.kind === 'zb1') return true
        if (step.kind === 'polizeibericht') return values['polizei_vor_ort'] === 'true'
        return step.feldKeys.some((k) => {
          const f = felderByKey.get(k)
          return f != null && meetsCondition(f.conditional_on, values)
        })
      }),
    [felderByKey, values],
  )

  const idx = Math.min(microIndex, Math.max(0, activeSteps.length - 1))
  const currentStep = activeSteps[idx]
  const isLast = idx >= activeSteps.length - 1

  function setFeld(key: string, val: unknown) {
    setValues((v) => ({ ...v, [key]: val }))
  }

  // ZB1-OCR → lokale values mergen (Halter-Step vorausfüllen + ist_fahrzeughalter
  // per Name-Match). Nur leere Felder füllen (H6-Parität mit der Server-Action).
  function handleZb1Extracted(ex: Zb1FlowExtracted) {
    setValues((v) => {
      const next = { ...v }
      if (istLeer(next['kennzeichen']) && ex.kennzeichen) next['kennzeichen'] = ex.kennzeichen
      if (istLeer(next['ist_fahrzeughalter'])) {
        if (namensMatch(ex.halter_vorname, ex.halter_nachname, next['vorname'], next['nachname'])) {
          next['ist_fahrzeughalter'] = 'true' // Kunde == Halter → Sub-Block entfällt
        } else if (ex.halter_nachname) {
          next['ist_fahrzeughalter'] = 'false'
          const fill = (k: string, val: string | null) => {
            if (val && istLeer(next[k])) next[k] = val
          }
          fill('halter_vorname', ex.halter_vorname)
          fill('halter_nachname', ex.halter_nachname)
          fill('halter_strasse', ex.halter_strasse)
          fill('halter_plz', ex.halter_plz)
          fill('halter_stadt', ex.halter_stadt)
        }
      }
      return next
    })
  }

  function handleZurueck() {
    setError(null)
    setMicroIndex((i) => Math.max(0, Math.min(i, activeSteps.length - 1) - 1))
  }

  async function handleWeiter() {
    if (!isLast) {
      // Hintergrund-Autosave (best effort): Resume + Realtime, nicht blockierend.
      void speichereFeststellungFlow(token, values).catch(() => {})
      setError(null)
      setMicroIndex(idx + 1)
      return
    }
    setSaving(true)
    setError(null)
    const res = await speichereFeststellungFlow(token, values)
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? t('step_feststellung.error_save'))
      return
    }
    onWeiter()
  }

  if (!currentStep) return null

  const sichtbareFelder =
    currentStep.kind === 'felder'
      ? currentStep.feldKeys
          .map((k) => felderByKey.get(k))
          .filter((f): f is OnboardingFeld => f != null && meetsCondition(f.conditional_on, values))
      : []

  return (
    <div>
      {/* Sub-Fortschritt innerhalb des Feststellungs-Kapitels */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-claimondo-ondo">
            {currentStep.kapitel}
          </span>
          <span className="text-[11px] font-medium text-claimondo-ondo/70">
            {idx + 1} / {activeSteps.length}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-claimondo-navy/[0.06]">
          <div
            className="h-full rounded-full bg-claimondo-ondo transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
            style={{ width: `${((idx + 1) / activeSteps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Frage */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold leading-snug text-claimondo-navy">{currentStep.titel}</h1>
        {currentStep.sub && <p className="mt-2 text-sm text-claimondo-ondo">{currentStep.sub}</p>}
      </div>

      {/* Körper */}
      {currentStep.kind === 'felder' && (
        <div className="flex flex-col gap-5" data-testid={`feststellung-step-${currentStep.id}`}>
          {sichtbareFelder.map((feld) => (
            <FieldRenderer
              key={feld.id}
              feld={feld}
              value={values[feld.feld_key]}
              onChange={(val) => setFeld(feld.feld_key, val)}
              disabled={saving}
            />
          ))}
        </div>
      )}

      {currentStep.kind === 'zb1' && (
        <div className="flex flex-col gap-4" data-testid="feststellung-step-zb1">
          <FlowZb1Upload token={token} bereitsErfasst={fahrzeugErfasst} onExtracted={handleZb1Extracted} />
          {dokumentFelder.length > 0 &&
            (!showManuell ? (
              <button
                type="button"
                onClick={() => setShowManuell(true)}
                className="self-start text-sm text-claimondo-ondo underline"
                data-testid="flow-doc-manuell-toggle"
              >
                {t('step_feststellung.manuell_toggle')}
              </button>
            ) : (
              <div className="rounded-ios-md border border-claimondo-border bg-white p-4" data-testid="flow-doc-manuell">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-claimondo-ondo">
                  {t('step_feststellung.fahrzeugdaten')}
                </p>
                <div className="flex flex-col gap-4">
                  {dokumentFelder.map((feld) => (
                    <FieldRenderer
                      key={feld.id}
                      feld={feld}
                      value={values[feld.feld_key]}
                      onChange={(val) => setFeld(feld.feld_key, val)}
                      disabled={saving}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {currentStep.kind === 'polizeibericht' && (
        <FlowPolizeiberichtUpload
          token={token}
          bereitsHochgeladen={initialValues['polizeibericht_status'] === 'hochgeladen'}
        />
      )}

      {error && (
        <p className="mt-4 rounded-ios-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-strong">
          {error}
        </p>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center gap-3">
        {idx > 0 && (
          <Button variant="ghost" size="lg" onClick={handleZurueck} disabled={saving}>
            {t('common.zurueck')}
          </Button>
        )}
        <div className="flex-1">
          <Button variant="ondo" size="lg" fullWidth loading={saving} onClick={handleWeiter}>
            {t('common.weiter')}
          </Button>
        </div>
      </div>
    </div>
  )
}
