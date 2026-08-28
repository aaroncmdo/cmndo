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
import { autosaveFeststellung } from './autosave-feststellung'
import { useTranslations } from 'next-intl'
import type { OnboardingPhase, OnboardingFeld } from '@/components/onboarding/types'
import { FieldRenderer } from '@/components/onboarding/FieldRenderer'
import { istFeststellungsFeld, istDokumentManuellFeld } from '@/lib/self-service/feststellung-felder'
import { enqueueOp } from '@/lib/offline/enqueue'
import { speichereFeststellungFlow } from './self-service-feststellung-actions'
import { FlowZb1Upload, type Zb1FlowExtracted } from './FlowZb1Upload'
import { FlowPolizeiberichtUpload } from './FlowPolizeiberichtUpload'
import { FlowZeugenaussageUpload } from './FlowZeugenaussageUpload'
import { computeActiveFeststellungSteps, meetsCondition } from './feststellung-steps'
import { Button } from '@/components/primitives/Button/Button.web'

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
  // AAR-956 16.06. (Aaron-Bug "1/1"/Sprung): phasen beim Mount cappen. Der /flow-RSC-
  // Re-Render (LeadRealtimeRefresh, page.tsx:302) leert feststellungPhasen, sobald
  // unfallhergang gefüllt ist (page.tsx: feststellungNeeded = !lead.unfallhergang).
  // Ohne Cap recomputen felderByKey + activeSteps auf die leere Config → alle felder-
  // Schritte fallen raus, nur der immer-sichtbare zb1-Step bleibt → "1/1" + Sprung
  // zum Fahrzeugschein mitten im Flow. Spiegelt initialHatFeststellung im Eltern-
  // Wizard (FlowWizardKfz), der denselben RSC-Shrink am OUTER-Step cappt.
  const [phasenStabil] = useState(phasen)
  // AAR-956 16.06. (Aaron): Navigation an die Schritt-ID, NICHT an den Positions-Index.
  // activeSteps re-filtert reaktiv (bedingte Schritte aus values) — ein Positions-Index
  // zeigte nach dem Re-Filter auf einen ANDEREN Schritt → der Flow "sprang". null = erster Schritt.
  const [currentStepId, setCurrentStepId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showManuell, setShowManuell] = useState(false)

  // feld_key -> sichtbares ①-Feststellungsfeld (audience kunde schon via ladeFlowPhasen).
  const felderByKey = useMemo(() => {
    const m = new Map<string, OnboardingFeld>()
    for (const p of phasenStabil) for (const f of p.felder) if (istFeststellungsFeld(f)) m.set(f.feld_key, f)
    return m
  }, [phasenStabil])

  // OCR-Folgedaten (Fahrzeug-ID), die der Kunde OHNE Foto manuell eintippen kann —
  // nur die noch leeren, dedupet je feld_key. Leben im ZB1-Schritt als Fallback.
  const dokumentFelder = useMemo(
    () =>
      Array.from(
        new Map(phasenStabil.flatMap((p) => p.felder).filter(istDokumentManuellFeld).map((f) => [f.feld_key, f])).values(),
      ).filter((f) => istLeer(initialValues[f.feld_key])),
    [phasenStabil, initialValues],
  )

  const fahrzeugErfasst = ['kennzeichen', 'fin', 'fahrzeug_hersteller'].some((k) => !istLeer(initialValues[k]))

  // Aktive Schritte (reaktiv auf values): felder-Schritt sichtbar wenn >=1 Feld
  // sichtbar, polizeibericht nur bei Polizei vor Ort, zb1 immer. felderByKey ist
  // mount-stabil (phasenStabil) → kein "1/1"-Kollaps nach RSC-Shrink.
  const activeSteps = useMemo(
    () => computeActiveFeststellungSteps(felderByKey, values),
    [felderByKey, values],
  )

  // Index aus der Schritt-ID ableiten (stabil bei activeSteps-Refilter). currentStepId=null
  // ODER verschwundener Schritt → Fallback auf den ersten (greift praktisch nie, da der
  // aktuelle Schritt nie aus seinem EIGENEN Feld heraus deaktiviert wird).
  const foundIdx = currentStepId == null ? 0 : activeSteps.findIndex((s) => s.id === currentStepId)
  const idx = foundIdx >= 0 ? Math.min(foundIdx, Math.max(0, activeSteps.length - 1)) : 0
  const currentStep = activeSteps[idx]
  const isLast = idx >= activeSteps.length - 1

  // Navigation IMMER über die Ziel-Schritt-ID (clampt + merkt sich die ID).
  function gotoIdx(target: number) {
    const c = Math.max(0, Math.min(target, activeSteps.length - 1))
    setCurrentStepId(activeSteps[c]?.id ?? null)
  }

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
    gotoIdx(idx - 1)
  }

  async function handleWeiter() {
    if (!isLast) {
      // Hintergrund-Autosave: nicht blockierend, aber auch nicht still. Schlaegt der Save
      // fehl, geht der Wert in die Outbox statt verloren (siehe autosave-feststellung.ts —
      // das fruehere `.catch(() => {})` fing nichts, weil die Action nie wirft).
      autosaveFeststellung(token, values)
      setError(null)
      gotoIdx(idx + 1)
      return
    }
    // Slice 2-write-1: letzter Schritt — offline enqueue + optimistisch weiter (Handler replayed).
    if (!navigator.onLine) {
      void enqueueOp({ kind: 'flow_feststellung', replay_class: 'B', payload: { token, values } }).catch(() => {})
      onWeiter()
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

  // AAR-956 18.06. (Aaron): explizites „vorerst überspringen" — die GANZE Feststellung
  // überspringen (best-effort-Save des bisher Eingegebenen, nicht blockierend) und raus
  // aus dem Block. Hält die Conversion frei; die Fakten kommen via Dispatch oder später
  // im Kunde-Onboarding nach (DB-vorbefüllt → kein Doppel-Tippen).
  function handleSkipAll() {
    // Beim Ueberspringen ist der Save besonders heikel: der Kunde kommt hier NICHT mehr
    // vorbei. Ein verlorener Autosave waere endgueltig — deshalb ueber die Outbox.
    autosaveFeststellung(token, values)
    setError(null)
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
              // FlowLink-Review B (Aaron 24.07.): token durchreichen — der FieldRenderer
              // gatet das Unfallhergang-Sprachdiktat (VoiceDictation) an `token`
              // (feld_key === 'unfallhergang' && token → { kind: 'flow', token }). Ohne
              // token war der "Unfallhergang einsprechen"-Button unsichtbar → Aaron konnte
              // ihn nicht anklicken (es gab keinen). Die Voice-Infra existiert bereits
              // vollstaendig (VoiceDictation + useChunkedDictation + api/flow/voice-transcribe).
              token={token}
            />
          ))}
          {/* AAR-956 16.06. (Aaron): Polizeibericht-Upload INLINE im "Polizei & Zeugen"-
              Schritt (statt eigenem Schritt) — nur wenn Polizei vor Ort war. BKAT-Auslese
              (TBNR/Aktenzeichen via Claude) passiert serverseitig im Upload. */}
          {currentStep.id === 'polizei_zeugen' && values['polizei_vor_ort'] === 'true' && (
            <FlowPolizeiberichtUpload
              token={token}
              bereitsHochgeladen={initialValues['polizeibericht_status'] === 'hochgeladen'}
            />
          )}
          {/* AAR-956 16.06. (Aaron): Zeugenaussage-Upload INLINE, wenn Zeugen = Ja. */}
          {currentStep.id === 'polizei_zeugen' && values['zeugen'] === 'true' && (
            <FlowZeugenaussageUpload
              token={token}
              titel={t('step_feststellung.zeugenaussage_titel')}
              hinweis={t('step_feststellung.zeugenaussage_hinweis')}
              bereitsHochgeladen={initialValues['zeugenaussage_status'] === 'hochgeladen'}
            />
          )}
        </div>
      )}

      {currentStep.kind === 'zb1' && (
        <div className="flex flex-col gap-4" data-testid="feststellung-step-zb1">
          {/* AAR-956 17.07. (Smoke-Befund 1): Box-„überspringen" == „Weiter ohne Foto" —
              exakt die handleWeiter-Semantik (Autosave + nächster Schritt 8/10 bzw.
              Abschluss nur, wenn zb1 wirklich der letzte aktive Schritt ist). Vorher
              kollabierte die Box zu null → leerer Schritt, auf dem der Skip-ALL-Link
              wie „Foto überspringen" aussah und die Feststellung bei 7/10 beendete. */}
          <FlowZb1Upload
            token={token}
            bereitsErfasst={fahrzeugErfasst}
            onExtracted={handleZb1Extracted}
            onSkip={() => void handleWeiter()}
          />
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

      {/* AAR-956 18.06. (Aaron): expliziter Skip — die Feststellung ist optional und darf
          die Conversion nicht blockieren. Subtiler Link, kein zweiter Primär-Button. */}
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={handleSkipAll}
          disabled={saving}
          className="text-sm text-claimondo-ondo underline disabled:opacity-50"
          data-testid="feststellung-skip-all"
        >
          {t('step_feststellung.vorerst_ueberspringen')}
        </button>
      </div>
    </div>
  )
}
