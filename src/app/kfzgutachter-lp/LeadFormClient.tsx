'use client'

import { useState, useTransition, type FormEvent, type InputHTMLAttributes } from 'react'
import { Phone, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { submitKfzgutachterLead } from './actions'
import { trackLpEvent } from './track'
import { TEL_HREF, TEL_DISPLAY } from './constants'

// Generisches Lead-Formular für die kfzgutachter-Ads-Landeseite.
// Nutzt eigene Server-Action submitKfzgutachterLead; lp_variant + source
// werden zentral über trackLpEvent (./track) injiziert.

export function LeadFormClient({ id = 'lead-form' }: { id?: string }) {
  const [submittedName, setSubmittedName] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; field?: 'name' | 'phone' | 'city' } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)

    // UTMs aus dem aktuellen URL in die FormData kopieren — damit die
    // Server-Action sie in anfragen.utm_* persistieren kann (Spec §6.1).
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
        const v = params.get(key)
        if (v) fd.set(key, v)
      }
    }

    startTransition(async () => {
      const result = await submitKfzgutachterLead(fd)
      if (result.ok) {
        const name = String(fd.get('name') ?? '').trim()
        const firstName = name.split(/\s+/)[0] || null
        setError(null)
        setSubmittedName(firstName ?? '')
        trackLpEvent('generate_lead')
        form.reset()
      } else {
        setError({ message: result.error ?? 'Übermittlung fehlgeschlagen', field: result.field })
      }
    })
  }

  if (submittedName !== null) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-ios-lg border border-white/60 bg-white/85 p-5 shadow-glass-card backdrop-blur-md sm:p-7"
      >
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-7 w-7 flex-shrink-0 text-emerald-500" aria-hidden />
          <h2
            className="text-xl font-bold text-claimondo-navy sm:text-2xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Danke{submittedName ? `, ${submittedName}` : ''} — wir melden uns gleich.
          </h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">
          Ein Berater ruft Sie in <strong>unter 15 Minuten</strong> zurück. Bitte halten Sie das
          Telefon bereit — die Nummer kann unterdrückt sein.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
          Sie hören nichts? Rufen Sie uns direkt an:
        </p>
        <a
          href={TEL_HREF}
          data-tracking="call-success-card"
          onClick={() => trackLpEvent('phone_call', { event_label: 'call-success-card' })}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-claimondo-navy px-6 py-3.5 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield"
        >
          <Phone className="h-4 w-4" aria-hidden />
          {TEL_DISPLAY}
        </a>
        <button
          type="button"
          onClick={() => setSubmittedName(null)}
          className="mt-3 w-full text-center text-[12px] text-claimondo-shield/70 underline-offset-2 hover:underline"
        >
          Noch eine Anfrage senden
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
      className="rounded-ios-lg border border-white/60 bg-white/85 p-5 shadow-glass-card backdrop-blur-md sm:p-7"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
          Rückruf in unter 15 Minuten
        </span>
      </div>
      <h2
        className="text-xl font-bold leading-tight text-claimondo-navy sm:text-2xl"
        style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
      >
        Schaden melden — in 30 Sekunden
      </h2>
      <p className="mt-1 text-sm text-claimondo-shield/80">
        Drei Felder. Unverbindlich. DSGVO-konform.
      </p>

      <div className="mt-4 space-y-2.5 sm:mt-5 sm:space-y-3">
        <Field
          name="name"
          label="Ihr Name"
          type="text"
          placeholder="Max Mustermann"
          autoComplete="name"
          required
          disabled={pending}
          errorMessage={error?.field === 'name' ? error.message : undefined}
        />
        <Field
          name="phone"
          label="Ihre Telefonnummer"
          type="tel"
          placeholder="0151 12345678"
          autoComplete="tel"
          inputMode="tel"
          required
          disabled={pending}
          errorMessage={error?.field === 'phone' ? error.message : undefined}
        />
        <Field
          name="city"
          label="Stadt / PLZ des Unfalls"
          type="text"
          placeholder="z. B. Köln oder 50667"
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
        className="mt-4 w-full rounded-full bg-claimondo-navy px-6 py-3.5 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 sm:mt-5 sm:py-4"
      >
        {pending ? 'Wird gesendet …' : 'Jetzt kostenlosen Rückruf erhalten →'}
      </button>

      {error && !error.field ? (
        <div
          role="alert"
          className="mt-4 rounded-ios-md border border-red-200 bg-red-50 p-4 text-[13px] text-red-900"
        >
          <p className="font-semibold">{error.message}</p>
          <p className="mt-1 text-red-800/80">
            Klappt nicht? Rufen Sie uns direkt an —{' '}
            <a
              href={TEL_HREF}
              data-tracking="call-error-fallback"
              onClick={() => trackLpEvent('phone_call', { event_label: 'call-error-fallback' })}
              className="font-bold underline"
            >
              {TEL_DISPLAY}
            </a>
          </p>
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-claimondo-shield/70">
        Mit dem Absenden akzeptiere ich die{' '}
        <Link href="https://claimondo.de/datenschutz" className="underline">
          Datenschutzerklärung
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
  const fieldId = `kfzgl-${name}`
  const hasError = Boolean(errorMessage)
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-xs font-semibold text-claimondo-shield">
        {label}
      </label>
      <input
        id={fieldId}
        name={name}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${fieldId}-err` : undefined}
        {...rest}
        className={`w-full rounded-ios-md border bg-white px-4 py-3 text-base transition-all focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70 ${
          hasError
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
            : 'border-claimondo-border focus:border-claimondo-ondo focus:ring-claimondo-ondo/20'
        }`}
      />
      {hasError ? (
        <p id={`${fieldId}-err`} className="mt-1 text-xs font-semibold text-red-600">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
