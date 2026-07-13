'use client'

// Firmen-Flotte Layer 2 Slice 2a Task 4 — Unfallgegner-Meldungsflow
// Opponent (Unfallgegner, no account) taps NFC card → fills 4-step form →
// draft lead created via submitSchadenGegner (Task 5, already done).
//
// Wizard-Shape mirrored from /flow/[token]/FlowWizardKfz (step-state, navigation,
// progress indicator) without importing or editing that component.

import { useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { TextField } from '@/components/shared/forms/TextField'
import { VersichererSelect } from '@/components/shared/VersichererSelect'
import { submitSchadenGegner } from './actions'
import type { GegnerFormData } from './gegner-form-types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  token: string
  context: {
    kennzeichen: string | null
    hersteller: string | null
    modell: string | null
    firmaName: string | null
  }
  versicherer: Array<{ id: string; name: string }>
}

type Step = 1 | 2 | 3 | 4

const TOTAL_STEPS = 4

const STEP_LABELS: Record<Step, string> = {
  1: 'Kontaktdaten',
  2: 'Fahrzeug & Haftpflicht',
  3: 'Unfallhergang',
  4: 'Bestätigung',
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

export function SchadenGegnerWizard({ token, context, versicherer }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [submitted, setSubmitted] = useState(false)

  const [data, setData] = useState<GegnerFormData>({
    name: '',
    telefon: '',
    email: '',
    kennzeichen: '',
    fahrzeugtyp: '',
    versicherungId: undefined,
    schadennummer: '',
    hergang: '',
    consent: false,
  })

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function set<K extends keyof GegnerFormData>(key: K, value: GegnerFormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    const result = await submitSchadenGegner(token, data)
    setSubmitting(false)
    if (!result.ok) {
      setSubmitError(result.error)
      return
    }
    setSubmitted(true)
  }

  const contextLine = [context.firmaName, context.kennzeichen].filter(Boolean).join(' · ')
  const fahrzeugLabel = [context.hersteller, context.modell].filter(Boolean).join(' ')

  // ─── Success Screen ───────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <SectionCard>
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-success-soft flex items-center justify-center">
                <CheckIcon className="w-7 h-7 text-success-strong" />
              </div>
              <h1 className="text-heading-md text-claimondo-navy">
                Vielen Dank — Ihre Angaben wurden übermittelt.
              </h1>
              <p className="text-body-sm text-claimondo-ondo">
                Der Schaden wird bearbeitet. Sie erhalten bei Bedarf Rückmeldung.
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-claimondo-bg flex flex-col">
      {/* Sticky Step-Progress */}
      <div className="sticky top-0 z-20 border-b border-claimondo-navy/[0.06] bg-white/[0.78] backdrop-blur-[22px] backdrop-saturate-150">
        <div className="h-1 w-full bg-claimondo-navy/[0.06]">
          <div
            className="h-full bg-gradient-to-r from-claimondo-navy to-claimondo-ondo transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
            style={{ width: `${Math.round((step / TOTAL_STEPS) * 100)}%` }}
          />
        </div>
        <div className="mx-auto flex max-w-md items-center justify-center gap-2 px-5 py-3">
          {([1, 2, 3, 4] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                style={
                  s === step
                    ? {
                        boxShadow:
                          '0 0 0 5px color-mix(in srgb, var(--brand-secondary, #4573A2) 16%, transparent)',
                      }
                    : undefined
                }
                className={`grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-semibold tracking-[-.01em] transition-all duration-300 ease-[cubic-bezier(.32,.72,0,1)] ${
                  s < step
                    ? 'bg-claimondo-navy border-claimondo-navy text-white scale-[1.04]'
                    : s === step
                      ? 'bg-claimondo-ondo border-claimondo-ondo text-white scale-[1.06]'
                      : 'bg-white border-claimondo-navy/[0.10] text-claimondo-ondo/60'
                }`}
              >
                {s < step ? <CheckIcon className="w-3.5 h-3.5" /> : s}
              </div>
              {i < TOTAL_STEPS - 1 && (
                <div
                  className={`h-0.5 w-6 rounded-full transition-colors ${
                    s < step ? 'bg-claimondo-ondo' : 'bg-claimondo-navy/[0.06]'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-4 sm:px-5 pt-5 pb-32 max-w-md mx-auto w-full">
        {/* Header — always visible */}
        <div className="mb-5">
          <p className="text-caption text-claimondo-ondo mb-1">
            Schritt {step} von {TOTAL_STEPS} — {STEP_LABELS[step]}
          </p>
          <h1 className="text-heading-lg text-claimondo-navy">Unfallschaden melden</h1>
          {contextLine ? (
            <p className="text-body-sm text-claimondo-ondo mt-1">
              Unfallgegner: {contextLine}
            </p>
          ) : null}
          {fahrzeugLabel ? (
            <p className="text-caption text-claimondo-shield mt-0.5">{fahrzeugLabel}</p>
          ) : null}
        </div>

        <SectionCard className="flex-1">
          {/* ═══ Schritt 1 — Ihre Kontaktdaten ═══ */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <TextField
                label="Name *"
                value={data.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Vor- und Nachname"
                required
                autoComplete="name"
              />
              <TextField
                label="Telefonnummer"
                value={data.telefon ?? ''}
                onChange={(e) => set('telefon', e.target.value)}
                placeholder="+49 …"
                type="tel"
                autoComplete="tel"
              />
              <TextField
                label="E-Mail-Adresse"
                value={data.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                placeholder="name@beispiel.de"
                type="email"
                autoComplete="email"
              />
            </div>
          )}

          {/* ═══ Schritt 2 — Fahrzeug & Haftpflicht ═══ */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <TextField
                label="Kennzeichen"
                value={data.kennzeichen ?? ''}
                onChange={(e) => set('kennzeichen', e.target.value)}
                placeholder="z. B. B-AB 1234"
                autoComplete="off"
              />
              <TextField
                label="Fahrzeugtyp"
                value={data.fahrzeugtyp ?? ''}
                onChange={(e) => set('fahrzeugtyp', e.target.value)}
                placeholder="z. B. PKW, LKW, Motorrad"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-claimondo-shield">
                  Haftpflichtversicherung
                </label>
                <VersichererSelect
                  value={data.versicherungId ?? null}
                  onChange={(id) => set('versicherungId', id ?? undefined)}
                  versicherer={versicherer}
                  placeholder="Versicherung auswählen …"
                />
              </div>
              <TextField
                label="Schadennummer (optional)"
                value={data.schadennummer ?? ''}
                onChange={(e) => set('schadennummer', e.target.value)}
                placeholder="Ihre Schadennummer bei der Versicherung"
              />
            </div>
          )}

          {/* ═══ Schritt 3 — Unfallhergang ═══ */}
          {step === 3 && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-claimondo-shield">
                Unfallhergang
              </label>
              {/* Plain <textarea> — no shared Textarea component exists;
                  styled identically to TextField's INPUT_CLS pattern (token-bound). */}
              <textarea
                value={data.hergang ?? ''}
                onChange={(e) => set('hergang', e.target.value)}
                placeholder="Beschreiben Sie kurz den Unfallhergang: Wo, wann und wie ist es passiert?"
                rows={6}
                className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30 resize-y"
              />
              <p className="text-caption text-claimondo-shield">
                Geben Sie so viele Details wie möglich an — das erleichtert die Bearbeitung.
              </p>
            </div>
          )}

          {/* ═══ Schritt 4 — Bestätigung & Absenden ═══ */}
          {step === 4 && (
            <div className="flex flex-col gap-5">
              {/* Summary */}
              <div className="flex flex-col gap-2">
                <h2 className="text-heading-sm text-claimondo-navy mb-1">Zusammenfassung</h2>
                <SummaryRow label="Name" value={data.name || '—'} />
                {data.telefon ? <SummaryRow label="Telefon" value={data.telefon} /> : null}
                {data.email ? <SummaryRow label="E-Mail" value={data.email} /> : null}
                {data.kennzeichen ? (
                  <SummaryRow label="Kennzeichen" value={data.kennzeichen} />
                ) : null}
                {data.fahrzeugtyp ? (
                  <SummaryRow label="Fahrzeugtyp" value={data.fahrzeugtyp} />
                ) : null}
                {data.versicherungId ? (
                  <SummaryRow
                    label="Haftpflichtversicherung"
                    value={
                      versicherer.find((v) => v.id === data.versicherungId)?.name ??
                      data.versicherungId
                    }
                  />
                ) : null}
                {data.schadennummer ? (
                  <SummaryRow label="Schadennummer" value={data.schadennummer} />
                ) : null}
                {data.hergang ? (
                  <SummaryRow label="Unfallhergang" value={data.hergang} />
                ) : null}
              </div>

              {/* Pflicht-Hinweis */}
              <div className="rounded-ios-sm border border-warning/30 bg-warning-soft px-4 py-3 text-body-sm text-warning-strong">
                Der Schaden wird der Haftpflichtversicherung des Unfallverursachers gemeldet.
                Sie sind verpflichtet, den Schaden auch selbst Ihrer Haftpflichtversicherung
                zu melden.
              </div>

              {/* Consent */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.consent}
                  onChange={(e) => set('consent', e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-claimondo-border accent-claimondo-ondo shrink-0"
                />
                <span className="text-body-sm text-claimondo-ondo leading-relaxed">
                  Ich stimme der Verarbeitung meiner Daten zur Unfallregulierung zu.{' '}
                  <span className="text-danger">*</span>
                </span>
              </label>

              {/* Submit error */}
              {submitError ? (
                <p className="rounded-ios-sm border border-danger/30 bg-danger-soft px-4 py-3 text-body-sm text-danger-strong">
                  {submitError}
                </p>
              ) : null}

              {/* Submit */}
              <Button
                variant="ondo"
                fullWidth
                loading={submitting}
                disabled={!data.consent || submitting}
                onClick={handleSubmit}
              >
                Schaden absenden
              </Button>
            </div>
          )}
        </SectionCard>

        {/* Navigation */}
        <div className="pt-4 flex gap-3">
          {step > 1 ? (
            <Button
              variant="ghost"
              onClick={() => setStep((s) => (s - 1) as Step)}
              disabled={submitting}
            >
              Zurück
            </Button>
          ) : null}

          {step < TOTAL_STEPS ? (
            <Button
              variant="ondo"
              fullWidth
              disabled={step === 1 && !data.name.trim()}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Weiter
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 rounded-ios-sm bg-claimondo-navy/[0.03] border border-claimondo-navy/[0.06]">
      <span className="text-caption font-semibold uppercase tracking-[0.12em] text-claimondo-ondo">
        {label}
      </span>
      <span className="text-body-sm text-claimondo-navy break-words">{value}</span>
    </div>
  )
}
