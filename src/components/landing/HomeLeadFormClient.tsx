'use client'

import { useState, useTransition, type FormEvent, type InputHTMLAttributes } from 'react'
import Link from 'next/link'
import { CheckCircle2, Phone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/jsonld'
import { submitHomeLead } from './home-lead-action'

// Hero-Lead-Formular der Hauptseite. Vorher ein rohes
// <form action="/api/leads/home" method="POST"> -> diese Route existierte nie,
// Submit landete auf einer 404. Jetzt Client-Component + Server-Action
// (submitHomeLead), analog zu LeadFormClient (kfzgutachter-lp) und
// StadtLeadFormClient — der einheitliche Landing-Lead-Pfad im Projekt.
// i18n Wave A: home.lead_form.* via useTranslations — alle sichtbaren Strings
// übersetzt; Eigennamen (Claimondo, WhatsApp) + Telefonnummern/URLs unverändert.

export function HomeLeadFormClient({ id = 'lead-form' }: { id?: string }) {
  const t = useTranslations('home')

  const [submittedName, setSubmittedName] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; field?: 'name' | 'phone' | 'city' } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)

    // UTMs aus der aktuellen URL in die FormData kopieren — damit die
    // Server-Action sie in anfragen.utm_* persistieren kann.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
        const v = params.get(key)
        if (v) fd.set(key, v)
      }
    }

    startTransition(async () => {
      const result = await submitHomeLead(fd)
      if (result.ok) {
        const name = String(fd.get('name') ?? '').trim()
        const firstName = name.split(/\s+/)[0] || null
        setError(null)
        setSubmittedName(firstName ?? '')
        form.reset()
      } else {
        setError({ message: result.error ?? t('lead_form.error_fallback'), field: result.field })
      }
    })
  }

  if (submittedName !== null) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-ios-lg border border-white/60 bg-white/85 p-6 shadow-claimondo-lg backdrop-blur-xl sm:p-8"
      >
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-7 w-7 flex-shrink-0 text-emerald-500" aria-hidden />
          <h2 className="text-xl font-bold text-claimondo-navy sm:text-2xl">
            {t('lead_form.success_heading', { name: submittedName || 'empty' })}
          </h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">
          {t.rich('lead_form.success_body', {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
          {t('lead_form.success_no_response')}
        </p>
        <a
          href={`tel:${PHONE_E164}`}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-claimondo-navy px-6 py-3.5 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield"
        >
          <Phone className="h-4 w-4" aria-hidden />
          {PHONE_DISPLAY}
        </a>
        <button
          type="button"
          onClick={() => setSubmittedName(null)}
          className="mt-3 w-full text-center text-[12px] text-claimondo-shield/70 underline-offset-2 hover:underline"
        >
          {t('lead_form.success_another')}
        </button>
      </div>
    )
  }

  return (
    <form
      id={id}
      onSubmit={handleSubmit}
      noValidate
      data-tracking="lead-form-hero"
      className="rounded-ios-lg border border-white/60 bg-white/85 p-6 shadow-claimondo-lg backdrop-blur-xl sm:p-8"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
          {t('lead_form.rueckruf_badge')}
        </span>
      </div>
      <h2 className="text-2xl font-bold text-claimondo-navy">{t('lead_form.heading')}</h2>
      <p className="mt-1 text-sm text-claimondo-shield/80">
        {t('lead_form.sub')}
      </p>
      <div className="mt-5 space-y-3">
        <Field
          name="name"
          label={t('lead_form.field_name_label')}
          type="text"
          placeholder={t('lead_form.field_name_placeholder')}
          autoComplete="name"
          required
          disabled={pending}
          errorMessage={error?.field === 'name' ? error.message : undefined}
        />
        <Field
          name="phone"
          label={t('lead_form.field_phone_label')}
          type="tel"
          placeholder={t('lead_form.field_phone_placeholder')}
          autoComplete="tel"
          inputMode="tel"
          required
          disabled={pending}
          errorMessage={error?.field === 'phone' ? error.message : undefined}
        />
        <Field
          name="city"
          label={t('lead_form.field_city_label')}
          type="text"
          placeholder={t('lead_form.field_city_placeholder')}
          autoComplete="postal-code"
          required
          disabled={pending}
          errorMessage={error?.field === 'city' ? error.message : undefined}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="mt-5 w-full rounded-full bg-claimondo-navy px-6 py-4 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? t('lead_form.submit_pending') : t('lead_form.submit')}
      </button>

      {error && !error.field ? (
        <div
          role="alert"
          className="mt-4 rounded-ios-md border border-red-200 bg-red-50 p-4 text-[13px] text-red-900"
        >
          <p className="font-semibold">{error.message}</p>
          <p className="mt-1 text-red-800/80">
            {t('lead_form.error_no_response')}{' '}
            <a href={`tel:${PHONE_E164}`} className="font-bold underline">
              {PHONE_DISPLAY}
            </a>
          </p>
        </div>
      ) : null}

      <p className="mt-3 text-[11px] text-claimondo-shield/70">
        {t('lead_form.datenschutz_prefix')}{' '}
        <Link href="/datenschutz" className="underline">
          {t('lead_form.datenschutz_link')}
        </Link>
        .
      </p>
    </form>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  name: string
  errorMessage?: string
}

function Field({ label, name, errorMessage, ...rest }: FieldProps) {
  const id = `home-lead-${name}`
  const hasError = Boolean(errorMessage)
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-claimondo-shield">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${id}-err` : undefined}
        {...rest}
        className={`w-full rounded-ios-md border bg-white/85 px-4 py-3 text-base transition-all focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70 ${
          hasError
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
            : 'border-claimondo-border focus:border-claimondo-ondo focus:ring-claimondo-ondo/20'
        }`}
      />
      {hasError ? (
        <p id={`${id}-err`} className="mt-1 text-xs font-semibold text-red-600">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
