'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronLeft, Phone, ShieldCheck, RotateCcw, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/jsonld'
import { submitCheckLead } from './check-lead-action'
import { trackEvent } from '@/lib/analytics/track-event'
import { setUserData } from '@/lib/analytics/user-data'
import { buildCheckResult, type Schuld, type Frist, type Gutachten } from '@/lib/check/result-model'
import { AnspruchFotoCheckCta } from '@/components/check/AnspruchFotoCheckCta'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'

// Interaktive Anspruchs-Prüfung: 3 Klick-Fragen -> antwort-adaptives Ergebnis
// (result-model.ts, 4 Tiers) -> Lead-Formular (submitCheckLead). Funnel-Tracking
// via trackEvent (check_start/step/complete + generate_lead).
// Generische Formular-Strings aus home.lead_form.* (1 Lead-Pfad im Projekt);
// Check-spezifischer Text aus check.*.
// Design: docs/superpowers/specs/2026-06-26-check-anspruch-rebuild-design.md

type Answers = { schuld?: Schuld; unfall_her?: Frist; gutachten?: Gutachten }

const RANGE_KEYS = ['range_auslagen', 'range_nutzungsausfall', 'range_wertminderung', 'range_kostenlos'] as const

export function CheckFunnelClient() {
  const t = useTranslations('check')
  const tl = useTranslations('home') // lead_form.* wiederverwenden

  const [step, setStep] = useState(0) // 0..2 Fragen, 3 = Ergebnis + Formular
  const [answers, setAnswers] = useState<Answers>({})
  const [submittedName, setSubmittedName] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; field?: 'name' | 'phone' | 'city' } | null>(null)
  const [pending, startTransition] = useTransition()
  const startedRef = useRef(false)
  // P4 Ortseingaben: Ort-Autocomplete controlled (AC rendert kein name) -> Wert per hidden input in FormData.
  const [city, setCity] = useState('')
  const [placeId, setPlaceId] = useState('')

  const QUESTIONS = [
    {
      key: 'schuld' as const,
      label: t('q1_label'),
      options: [
        { value: 'gegner', label: t('q1_gegner') },
        { value: 'teils', label: t('q1_teils') },
        { value: 'unklar', label: t('q1_unklar') },
        { value: 'selbst', label: t('q1_selbst') },
      ],
    },
    {
      key: 'unfall_her' as const,
      label: t('q2_label'),
      options: [
        { value: 'unter_woche', label: t('q2_unter_woche') },
        { value: 'bis_monat', label: t('q2_bis_monat') },
        { value: 'ueber_monat', label: t('q2_ueber_monat') },
      ],
    },
    {
      key: 'gutachten' as const,
      label: t('q3_label'),
      options: [
        { value: 'nein', label: t('q3_nein') },
        { value: 'versicherung', label: t('q3_versicherung') },
        { value: 'ja', label: t('q3_ja') },
      ],
    },
  ]

  function choose(key: keyof Answers, value: string) {
    const nextAnswers = { ...answers, [key]: value }
    setAnswers(nextAnswers)

    if (!startedRef.current) {
      trackEvent('check_start')
      startedRef.current = true
    }
    trackEvent('check_step', { question: key, value })

    const nextStep = Math.min(step + 1, QUESTIONS.length)
    setStep(nextStep)
    if (nextStep >= QUESTIONS.length) {
      trackEvent('check_complete', { tier: buildCheckResult(nextAnswers).tier })
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    if (answers.schuld) fd.set('schuld', answers.schuld)
    if (answers.unfall_her) fd.set('unfall_her', answers.unfall_her)
    if (answers.gutachten) fd.set('gutachten', answers.gutachten)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
        const v = params.get(k)
        if (v) fd.set(k, v)
      }
      // Makler-Hub-Attribution: ?m=<Promo-Code> aus der Hub-URL (/m/[code] -> /check?m=) mitschicken.
      const maklerCode = params.get('m')
      if (maklerCode) fd.set('m', maklerCode)
    }
    startTransition(async () => {
      const res = await submitCheckLead(fd)
      if (res.ok) {
        const name = String(fd.get('name') ?? '').trim()
        setError(null)
        setSubmittedName(name.split(/\s+/)[0] || '')
        // Enhanced Conversions: Form-Daten (gehasht via gtag) für besseres Ads-Matching.
        setUserData({ name, phone: String(fd.get('phone') ?? '') })
        // Conversion-Event (Task 2): Lead aus dem Anspruch-Check. Tier mitgeben
        // fuer Funnel-Analyse. Feuert auch bei Consent=denied (Consent-Mode-Modeling).
        trackEvent('generate_lead', {
          currency: 'EUR',
          value: 0,
          source: 'check-anspruch',
          tier: buildCheckResult(answers).tier,
        })
        form.reset()
      } else {
        setError({ message: res.error ?? tl('lead_form.error_fallback'), field: res.field })
      }
    })
  }

  function restart() {
    setAnswers({})
    setStep(0)
    setSubmittedName(null)
    setError(null)
    startedRef.current = false
  }

  // --- Erfolg ---
  if (submittedName !== null) {
    return (
      <div role="status" aria-live="polite" className="rounded-ios-lg border border-claimondo-border bg-white p-6 shadow-claimondo-lg sm:p-8">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-7 w-7 flex-shrink-0 text-emerald-500" aria-hidden />
          <h2 className="text-xl font-bold text-claimondo-navy sm:text-2xl">
            {tl('lead_form.success_heading', { name: submittedName || 'empty' })}
          </h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{tl('lead_form.success_body')}</p>
        <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{tl('lead_form.success_no_response')}</p>
        <a
          href={`tel:${PHONE_E164}`}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-claimondo-navy px-6 py-3.5 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield"
        >
          <Phone className="h-4 w-4" aria-hidden />
          {PHONE_DISPLAY}
        </a>
        <button type="button" onClick={restart} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-[12px] text-claimondo-shield/70 underline-offset-2 hover:underline">
          <RotateCcw className="h-3 w-3" aria-hidden /> {t('restart')}
        </button>
      </div>
    )
  }

  const isResult = step >= QUESTIONS.length
  const result = buildCheckResult(answers)

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 shadow-claimondo-lg sm:p-8">
      {/* Fortschritt */}
      <div className="mb-5 flex items-center gap-2" aria-hidden>
        {QUESTIONS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i < step || isResult ? 'bg-claimondo-ondo' : 'bg-claimondo-border'}`}
          />
        ))}
      </div>

      {!isResult ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
            {t('step_of', { current: step + 1, total: QUESTIONS.length })}
          </p>
          <h2 className="mt-2 text-xl font-bold text-claimondo-navy sm:text-2xl">{QUESTIONS[step].label}</h2>
          <div className="mt-5 space-y-3">
            {QUESTIONS[step].options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => choose(QUESTIONS[step].key, opt.value)}
                className="flex w-full items-center justify-between gap-3 rounded-ios-md border border-claimondo-border bg-white px-5 py-4 text-left text-base font-semibold text-claimondo-navy transition-all hover:border-claimondo-ondo hover:bg-claimondo-bg active:scale-[0.99]"
              >
                {opt.label}
                <span className="text-claimondo-ondo">›</span>
              </button>
            ))}
          </div>
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-claimondo-shield hover:text-claimondo-navy"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> {t('back')}
            </button>
          ) : null}
        </div>
      ) : (
        <div>
          {/* Ergebnis — antwort-adaptiv (result-model) */}
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-claimondo-ondo" aria-hidden />
            <h2 className="text-xl font-bold text-claimondo-navy sm:text-2xl">{t(result.headingKey)}</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{t(result.subKey)}</p>

          <ul className="mt-5 space-y-3">
            {result.positions.map((pos) => (
              <li key={pos} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" aria-hidden />
                <span className="text-sm leading-relaxed text-claimondo-shield">
                  <strong className="text-claimondo-navy">{t(`ent_${pos}_t`)}</strong> — {t(`ent_${pos}_d`)}
                </span>
              </li>
            ))}
          </ul>

          {/* Illustrative €-Größenordnungen (nur bei echtem Gegner-Anspruch) */}
          {result.showRanges ? (
            <div className="mt-5 rounded-ios-md border border-claimondo-ondo/25 bg-claimondo-bg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">{t('ranges_heading')}</p>
              <ul className="mt-2.5 space-y-1.5">
                {RANGE_KEYS.map((k) => (
                  <li key={k} className="text-[13px] leading-relaxed text-claimondo-navy">{t(k)}</li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] text-claimondo-shield/70">{t('ranges_disclaimer')}</p>
            </div>
          ) : null}

          {/* Foto-Check-Verkettung: prominenter Upgrade-Pfad, nur bei echtem Anspruch */}
          {result.showRanges ? <AnspruchFotoCheckCta schuld={answers.schuld} /> : null}

          {/* Dynamische Hinweise */}
          {result.insightKeys.length > 0 ? (
            <div className="mt-5 space-y-2">
              {result.insightKeys.map((k) => (
                <div key={k} className="flex items-start gap-2.5 rounded-ios-md border border-claimondo-ondo/25 bg-claimondo-bg p-3.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-ondo" aria-hidden />
                  <p className="text-[13px] font-medium leading-relaxed text-claimondo-navy">{t(k)}</p>
                </div>
              ))}
            </div>
          ) : null}

          <p className="mt-4 text-[11px] text-claimondo-shield/70">{t('result_disclaimer')}</p>

          {/* Lead-Formular */}
          <div className="mt-6 border-t border-claimondo-border pt-6">
            <h3 className={result.showRanges ? 'text-base font-semibold text-claimondo-shield' : 'text-lg font-bold text-claimondo-navy'}>
              {result.showRanges ? t('lead_heading_alt') : t('lead_heading')}
            </h3>
            <p className="mt-1 text-sm text-claimondo-shield/80">{t('lead_sub')}</p>
            <form onSubmit={handleSubmit} noValidate data-tracking="lead-form-check" className="mt-4 space-y-3">
              <Field name="name" label={tl('lead_form.field_name_label')} placeholder={tl('lead_form.field_name_placeholder')} type="text" autoComplete="name" required disabled={pending} errorMessage={error?.field === 'name' ? error.message : undefined} />
              <Field name="phone" label={tl('lead_form.field_phone_label')} placeholder={tl('lead_form.field_phone_placeholder')} type="tel" autoComplete="tel" inputMode="tel" required disabled={pending} errorMessage={error?.field === 'phone' ? error.message : undefined} />
              <div>
                <label htmlFor="check-lead-city" className="mb-1.5 block text-xs font-semibold text-claimondo-shield">{tl('lead_form.field_city_label')}</label>
                {/* P4 Ortseingaben: Google-Places-Autocomplete füllt Stadt/PLZ; Wert -> verstecktes name="city" (+ place_id) für die FormData. */}
                <GooglePlaceAutocomplete
                  className="w-full rounded-ios-md border bg-white px-4 py-3 text-base transition-all focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70 border-claimondo-border focus:border-claimondo-ondo focus:ring-claimondo-ondo/20"
                  placeholder={tl('lead_form.field_city_placeholder')}
                  defaultValue={city}
                  onSelect={(r) => { setCity(r.stadt || r.plz || r.adresse); setPlaceId(r.place_id) }}
                  onChange={(v) => { setCity(v); setPlaceId('') }}
                />
                <input type="hidden" name="city" value={city} />
                {placeId ? <input type="hidden" name="place_id" value={placeId} /> : null}
                {error?.field === 'city' ? (
                  <p className="mt-1 text-xs font-semibold text-red-600">{error.message}</p>
                ) : null}
              </div>
              <button
                type="submit"
                disabled={pending}
                aria-busy={pending}
                className="w-full rounded-full bg-claimondo-navy px-6 py-4 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {pending ? tl('lead_form.submit_pending') : t('lead_submit')}
              </button>
              {error && !error.field ? (
                <div role="alert" className="rounded-ios-md border border-red-200 bg-red-50 p-4 text-[13px] text-red-900">
                  <p className="font-semibold">{error.message}</p>
                  <p className="mt-1 text-red-800/80">
                    {tl('lead_form.error_no_response')}{' '}
                    <a href={`tel:${PHONE_E164}`} className="font-bold underline">{PHONE_DISPLAY}</a>
                  </p>
                </div>
              ) : null}
              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-claimondo-shield/70">
                  {tl('lead_form.datenschutz_prefix')}{' '}
                  <Link href="/datenschutz" className="underline">{tl('lead_form.datenschutz_link')}</Link>.
                </p>
                <button type="button" onClick={restart} className="inline-flex items-center gap-1 text-[11px] text-claimondo-shield/70 hover:text-claimondo-navy">
                  <RotateCcw className="h-3 w-3" aria-hidden /> {t('restart')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; errorMessage?: string }

function Field({ label, name, errorMessage, ...rest }: FieldProps) {
  const id = `check-lead-${name}`
  const hasError = Boolean(errorMessage)
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-claimondo-shield">{label}</label>
      <input
        id={id}
        name={name}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${id}-err` : undefined}
        {...rest}
        className={`w-full rounded-ios-md border bg-white px-4 py-3 text-base transition-all focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70 ${
          hasError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-claimondo-border focus:border-claimondo-ondo focus:ring-claimondo-ondo/20'
        }`}
      />
      {hasError ? <p id={`${id}-err`} className="mt-1 text-xs font-semibold text-red-600">{errorMessage}</p> : null}
    </div>
  )
}
