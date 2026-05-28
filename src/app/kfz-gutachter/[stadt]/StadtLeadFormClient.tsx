'use client'

import { useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('kfz_gutachter_stadt')
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    fd.set('source', `kfz-gutachter-${stadtSlug}`)

    startTransition(async () => {
      const result = await submitStadtLead(fd)
      if (result.ok) {
        toast.success(t('form_toast_success'))
        trackGtag('generate_lead', { source: `kfz-gutachter-${stadtSlug}` })
        trackGtag('conversion', { send_to: CONVERSION_LABEL })
        form.reset()
      } else {
        toast.error(result.error ?? t('form_toast_error'))
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
          {t('form_badge')}
        </span>
      </div>
      <h2 className="text-2xl font-bold text-claimondo-navy">
        {t('form_h2')}
      </h2>
      <p className="mt-1 text-sm text-claimondo-shield/80">
        {t('form_sub')}
      </p>
      <div className="mt-5 space-y-3">
        <Field name="name" label={t('form_name_label')} type="text" placeholder={t('form_name_placeholder')} autoComplete="name" required disabled={pending} />
        <Field name="phone" label={t('form_phone_label')} type="tel" placeholder={t('form_phone_placeholder')} autoComplete="tel" inputMode="tel" required disabled={pending} />
        <Field name="city" label={t('form_city_label')} type="text" placeholder={t('form_city_placeholder', { stadt: stadtName })} autoComplete="postal-code" defaultValue={stadtName} required disabled={pending} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-full bg-claimondo-navy px-6 py-4 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? t('form_submit_pending') : t('form_submit_idle')}
      </button>
      <p className="mt-3 text-[11px] text-claimondo-shield/70">
        {t.rich('form_consent', {
          link: (chunks) => (
            <Link href="/datenschutz" className="underline">
              {chunks}
            </Link>
          ),
        })}
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
