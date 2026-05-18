'use client'

import { useTransition, type FormEvent, type InputHTMLAttributes } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { submitKfzgutachterLead } from './actions'
import { trackLpEvent } from './track'

// Generisches Lead-Formular für die kfzgutachter-Ads-Landeseite.
// Nutzt eigene Server-Action submitKfzgutachterLead; lp_variant + source
// werden zentral über trackLpEvent (./track) injiziert.

export function LeadFormClient({ id = 'lead-form' }: { id?: string }) {
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)

    startTransition(async () => {
      const result = await submitKfzgutachterLead(fd)
      if (result.ok) {
        toast.success('Danke! Wir melden uns in unter 15 Minuten zurück.')
        trackLpEvent('generate_lead')
        form.reset()
      } else {
        toast.error(result.error ?? 'Übermittlung fehlgeschlagen')
      }
    })
  }

  return (
    <form
      id={id}
      onSubmit={handleSubmit}
      noValidate
      data-tracking="lead-form-hero"
      className="rounded-ios-lg border border-claimondo-border bg-white p-5 shadow-claimondo-lg sm:p-7"
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
        />
        <Field
          name="city"
          label="Stadt / PLZ des Unfalls"
          type="text"
          placeholder="z. B. Köln oder 50667"
          autoComplete="postal-code"
          required
          disabled={pending}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-full bg-claimondo-navy px-6 py-3.5 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 sm:mt-5 sm:py-4"
      >
        {pending ? 'Wird gesendet …' : 'Jetzt kostenlosen Rückruf erhalten →'}
      </button>

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

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }

function Field({ label, name, ...rest }: FieldProps) {
  const fieldId = `kfzgl-${name}`
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-xs font-semibold text-claimondo-shield">
        {label}
      </label>
      <input
        id={fieldId}
        name={name}
        {...rest}
        className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-3 text-base transition-all focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  )
}
