'use client'

// AAR-956 P4-A: ① Feststellung — der Kunde erklaert die deklarativen Fakten/Flags
// (Schaden/Fahrzeug-ID/Gegner/Unfall) vor der SA. Gerendert aus der lead-erfassung-
// Config via dem geteilten FieldRenderer; nichts ist Pflicht ("vorerst ueberspringen").

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { OnboardingPhase, OnboardingFeld } from '@/components/onboarding/types'
import { FieldRenderer } from '@/components/onboarding/FieldRenderer'
import { istFeststellungsFeld } from '@/lib/self-service/feststellung-felder'
import { speichereFeststellungFlow } from './self-service-feststellung-actions'

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

  // Nur Sektionen mit >=1 ①-Feld; Felder pro Sektion gefiltert.
  const sektionen = phasen
    .map((p) => ({ phase: p, felder: p.felder.filter(istFeststellungsFeld) }))
    .filter((s) => s.felder.length > 0)

  function setFeld(key: string, val: unknown) {
    setValues((v) => ({ ...v, [key]: val }))
  }

  async function handleWeiter() {
    setSaving(true)
    setError(null)
    const res = await speichereFeststellungFlow(token, values)
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Speichern fehlgeschlagen.')
      return
    }
    onWeiter()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-claimondo-navy leading-snug">
          {t.has('step_feststellung.heading')
            ? t('step_feststellung.heading')
            : 'Ein paar Angaben zu Ihrem Schaden'}
        </h1>
        <p className="mt-2 text-sm text-claimondo-ondo">
          {t.has('step_feststellung.sub')
            ? t('step_feststellung.sub')
            : 'Je genauer, desto schneller — alles ist optional und kann später ergänzt werden.'}
        </p>
      </div>

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

      {error && (
        <p className="mt-4 text-sm text-red-500 bg-red-50 border border-red-100 rounded-ios-md px-4 py-3">
          {error}
        </p>
      )}

      <button
        onClick={handleWeiter}
        disabled={saving}
        className="mt-7 w-full inline-flex items-center justify-center gap-2 min-h-12 px-6 py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)]"
      >
        {saving ? (t.has('common.speichern') ? t('common.speichern') : 'Speichern…') : t('common.weiter')}
      </button>
    </div>
  )
}
