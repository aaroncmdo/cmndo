'use client'

import { useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { submitKoelnLead } from './actions'

type GtagFn = (command: string, eventName: string, params?: Record<string, unknown>) => void

function trackGtag(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const w = window as unknown as { gtag?: GtagFn }
  w.gtag?.('event', eventName, params)
}

// TODO Maik Pramor: Conversion-Label hier einsetzen vor Go-Live
// Format: 'AW-XXXXXXXXX/AbCdEfGh1234567890' (Google-Ads-ID / Conversion-Label)
const CONVERSION_LABEL = 'AW-XXXXXXXXX/CONVERSION_LABEL_PLACEHOLDER'

export function LeadFormClient() {
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    startTransition(async () => {
      const result = await submitKoelnLead(formData)
      if (result.ok) {
        toast.success('Danke! Wir melden uns in unter 15 Minuten zurück.')
        trackGtag('generate_lead', { source: 'kfz-gutachter-koeln-ads' })
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
      className="rounded-3xl border border-white/60 bg-white/85 p-6 sm:p-8 backdrop-blur-xl shadow-[0_20px_60px_rgba(13,27,62,0.10)]"
      data-tracking="lead-form-hero"
      noValidate
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">Rückruf in 5 Minuten</span>
      </div>
      <h2 className="text-2xl font-bold text-claimondo-navy">Schaden melden in 30 Sekunden</h2>
      <p className="mt-1 text-sm text-claimondo-shield/80">3 Felder, ohne Anmeldung.</p>
      <div className="mt-5 space-y-3">
        <FieldRow label="Ihr Name"               name="name"  type="text" placeholder="Max Mustermann" autoComplete="name" required disabled={pending} />
        <FieldRow label="Ihre Telefonnummer"     name="phone" type="tel"  placeholder="0151 12345678"  autoComplete="tel" inputMode="tel" required disabled={pending} />
        <FieldRow label="Stadt / PLZ des Unfalls" name="city" type="text" placeholder="Köln oder 50670" autoComplete="postal-code" required disabled={pending} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-full bg-claimondo-navy px-6 py-4 text-base font-bold text-white shadow-[0_8px_24px_rgba(13,27,62,0.22)] hover:bg-claimondo-shield active:scale-[0.98] transition-all disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? 'Wird gesendet …' : 'Jetzt kostenlosen Rückruf erhalten →'}
      </button>
      <p className="mt-3 text-[11px] text-claimondo-shield/70">
        Mit dem Absenden akzeptiere ich die <Link href="/datenschutz" className="underline">Datenschutzerklärung</Link>.
      </p>
    </form>
  )
}

type FieldRowProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string }

function FieldRow({ label, name, ...rest }: FieldRowProps) {
  const id = `lead-${name}`
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-claimondo-shield mb-1.5">{label}</label>
      <input
        id={id}
        name={name}
        {...rest}
        className="w-full rounded-xl border border-claimondo-border bg-white/85 px-4 py-3 text-base focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20 transition-all disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  )
}
