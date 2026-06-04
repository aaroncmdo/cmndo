'use client'

// AAR-956 P4-A: ① Feststellung — der Kunde erklaert die deklarativen Fakten/Flags
// (Schaden/Fahrzeug-ID/Gegner/Unfall) vor der SA. Gerendert aus der lead-erfassung-
// Config via dem geteilten FieldRenderer; nichts ist Pflicht ("vorerst ueberspringen").

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { OnboardingPhase, OnboardingFeld, ConditionalOn } from '@/components/onboarding/types'
import { FieldRenderer } from '@/components/onboarding/FieldRenderer'
import { istFeststellungsFeld, istDokumentManuellFeld } from '@/lib/self-service/feststellung-felder'
import { speichereFeststellungFlow } from './self-service-feststellung-actions'
import { FlowZb1Upload } from './FlowZb1Upload'
import { FlowPolizeiberichtUpload } from './FlowPolizeiberichtUpload'
import { Button } from '@/components/primitives/Button/Button.web'

// Spiegelt WizardClient.meetsCondition: ein Feld/eine Phase ist sichtbar, wenn keine
// Bedingung gesetzt ist oder der aktuelle Wert des Bedingungsfelds exakt passt (String-Vergleich).
function meetsCondition(cond: ConditionalOn | null | undefined, vals: Record<string, unknown>): boolean {
  if (!cond) return true
  return String(vals[cond.feld] ?? '') === cond.equals
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showManuell, setShowManuell] = useState(false)

  // Nur Sektionen mit >=1 ①-Feld; Felder pro Sektion gefiltert + conditional_on-Sichtbarkeit
  // (reaktiv auf `values` — z.B. halter_* nur bei ist_fahrzeughalter=false, polizei_aktenzeichen
  // nur bei polizei_vor_ort=true). FlowFeststellungStep ignorierte conditional_on bisher (anders
  // als WizardClient), wodurch ~6 bedingte Felder unbedingt erschienen (halter_*, vorschaeden_/
  // sachschaden_beschreibung, polizei_aktenzeichen, schadentyp_freitext, kanzlei_wunsch).
  const sektionen = phasen
    .filter((p) => meetsCondition(p.conditional_on, values))
    .map((p) => ({
      phase: p,
      felder: p.felder.filter((f) => istFeststellungsFeld(f) && meetsCondition(f.conditional_on, values)),
    }))
    .filter((s) => s.felder.length > 0)

  // AAR-956 Part 2 ("nur Lücken"): liegen Kern-Fahrzeugdaten schon vor (Dispatch/früherer
  // OCR), ist der ZB1-Upload nur optional zum Ergänzen — sonst der primäre Füll-Weg.
  const fahrzeugErfasst = ['kennzeichen', 'fin', 'fahrzeug_hersteller'].some((k) => {
    const v = initialValues[k]
    return typeof v === 'string' ? v.trim().length > 0 : v != null
  })

  // AAR-956 Part 2 (3. Weg „manuell" + „nur Lücken"): Fahrzeug-Dokumentfelder, die der Kunde
  // OHNE Foto eintippen kann — nur die noch LEEREN (Gaps), dedupet je feld_key.
  const istLeer = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')
  const dokumentFelder = Array.from(
    new Map(
      phasen.flatMap((p) => p.felder).filter(istDokumentManuellFeld).map((f) => [f.feld_key, f]),
    ).values(),
  ).filter((f) => istLeer(initialValues[f.feld_key]))

  function setFeld(key: string, val: unknown) {
    setValues((v) => ({ ...v, [key]: val }))
  }

  async function handleWeiter() {
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-claimondo-navy leading-snug">
          {t('step_feststellung.heading')}
        </h1>
        <p className="mt-2 text-sm text-claimondo-ondo">
          {t('step_feststellung.sub')}
        </p>
      </div>

      {/* AAR-956 Part 2: ZB1-Foto-Upload (OCR füllt Fahrzeug/Halter, H6) + manuelle
          Korrektur; bereitsErfasst gated den Hinweis auf "nur Lücken ergänzen". */}
      <FlowZb1Upload token={token} bereitsErfasst={fahrzeugErfasst} />

      {/* AAR-956 Part 2: 3. Weg — Fahrzeugdaten OHNE Foto manuell eintippen (nur Lücken).
          Fallback wenn kein Foto da ist oder die OCR scheitert; speichert via denselben Pfad. */}
      {dokumentFelder.length > 0 && (
        <div className="mb-5">
          {!showManuell ? (
            <button
              type="button"
              onClick={() => setShowManuell(true)}
              className="text-sm text-claimondo-ondo underline"
              data-testid="flow-doc-manuell-toggle"
            >
              Lieber ohne Foto — Fahrzeugdaten manuell eingeben
            </button>
          ) : (
            <div
              className="rounded-ios-md border border-claimondo-border bg-white p-4"
              data-testid="flow-doc-manuell"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-claimondo-ondo/60 mb-3">
                Fahrzeugdaten
              </p>
              <div className="space-y-4">
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
          )}
        </div>
      )}

      <div className="space-y-7">
        {sektionen.map(({ phase, felder }) => (
          <section key={phase.id}>
            {phase.titel && (
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-claimondo-ondo/60 mb-3">
                {phase.titel}
              </h2>
            )}
            <div className="space-y-4">
              {felder.map((feld: OnboardingFeld) => (
                <FieldRenderer
                  key={feld.id}
                  feld={feld}
                  value={values[feld.feld_key]}
                  onChange={(val) => setFeld(feld.feld_key, val)}
                  disabled={saving}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* AAR-956 Gebiet-3: Polizeibericht-Upload — nur wenn "Polizei vor Ort" = Ja (reaktiv). */}
      {values['polizei_vor_ort'] === 'true' && <FlowPolizeiberichtUpload token={token} />}

      {error && (
        <p className="mt-4 text-sm text-red-500 bg-red-50 border border-red-100 rounded-ios-md px-4 py-3">
          {error}
        </p>
      )}

      <Button
        variant="ondo"
        size="lg"
        fullWidth
        loading={saving}
        onClick={handleWeiter}
        className="mt-7"
      >
        {t('common.weiter')}
      </Button>
    </div>
  )
}
