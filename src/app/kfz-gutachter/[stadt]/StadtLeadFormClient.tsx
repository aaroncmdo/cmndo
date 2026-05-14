'use client'

import { useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { submitStadtLead } from './actions'

type GtagFn = (command: string, eventName: string, params?: Record<string, unknown>) => void
function trackGtag(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const w = window as unknown as { gtag?: GtagFn }
  w.gtag?.('event', eventName, params)
}

// TODO Maik Pramor: Conversion-Label vor Go-Live einsetzen.
const CONVERSION_LABEL = 'AW-XXXXXXXXX/CONVERSION_LABEL_PLACEHOLDER'

type Props = {
  stadtName: string
  stadtSlug: string
}

export function StadtLeadFormClient({ stadtName, stadtSlug }: Props) {
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    fd.set('source', `kfz-gutachter-${stadtSlug}`)

    startTransition(async () => {
      const result = await submitStadtLead(fd)
      if (result.ok) {
        toast.success('Danke! Wir melden uns in unter 15 Minuten zurück.')
        trackGtag('generate_lead', { source: `kfz-gutachter-${stadtSlug}` })
        trackGtag('conversion', { send_to: CONVERSION_LABEL })
        form.reset()
      } else {
        toast.error(result.error ?? 'Übermittlung fehlgeschlagen')
      }
    })
  }

  return (
    <form
      id="lead-form"
      onSubmit={handleSubmit}
      className="rounded-ios-lg border border-white/60 bg-white/85 p-6 backdrop-blur-xl shadow-claimondo-lg sm:p-8"
      data-tracking="lead-form-hero"
      noValidate
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
          Rückruf in 5 Minuten
        </span>
      </div>
      <h2 className="text-2xl font-bold text-claimondo-navy">
        Schaden melden — in 30 Sekunden
      </h2>
      <p className="mt-1 text-sm text-claimondo-shield/80">
        Drei Felder. Ohne Anmeldung. DSGVO-konform.
      </p>
      <div className="mt-5 space-y-3">
        <Field name="name" label="Ihr Name" type="text" placeholder="Max Mustermann" autoComplete="name" required disabled={pending} />
        <Field name="phone" label="Ihre Telefonnummer" type="tel" placeholder="0151 12345678" autoComplete="tel" inputMode="tel" required disabled={pending} />
        <Field name="city" label={`Stadt / PLZ des Unfalls`} type="text" placeholder={`${stadtName} oder PLZ`} autoComplete="postal-code" defaultValue={stadtName} required disabled={pending} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-full bg-claimondo-navy px-6 py-4 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? 'Wird gesendet …' : 'Jetzt kostenlosen Rückruf erhalten →'}
      </button>
      <p className="mt-3 text-[11px] text-claimondo-shield/70">
        Mit dem Absenden akzeptiere ich die{' '}
        <Link href="/datenschutz" className="underline">
          Datenschutzerklärung
        </Link>
        .
      </p>
    </form>
  )
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }
function Field({ label, name, ...rest }: FieldProps) {
  const id = `stadt-lead-${name}`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-claimondo-shield">
        {label}
      </label>
      <input
        id={id}
        name={name}
        {...rest}
        className="w-full rounded-ios-md border border-claimondo-border bg-white/85 px-4 py-3 text-base transition-all focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  )
}
