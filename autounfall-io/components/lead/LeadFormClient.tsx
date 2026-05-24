'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { submitAutounfallLead, type SubmitLeadResult } from '@/app/gutachter-finden/actions'
import { trackCtaClick, trackLeadSubmit } from '@/lib/track'

// Lead-Formular für /gutachter-finden. Felder name/telefon/email?/plz_oder_stadt
// + Schadenskontext + DSGVO-Pflicht-Checkbox. Hidden-Inputs für utm_*/ref/
// schadenstyp (aus ?query). Kein roher <form action="/api/…"> — ruft die
// Server-Action submitAutounfallLead und behandelt das Result-Object.

const SCHADENSTYPEN: { value: string; label: string }[] = [
  { value: 'auffahrunfall', label: 'Auffahrunfall' },
  { value: 'parkschaden', label: 'Parkschaden' },
  { value: 'totalschaden', label: 'Totalschaden' },
  { value: 'hagel-sturm', label: 'Hagel / Sturm / Naturgewalt' },
  { value: 'wildschaden', label: 'Wildschaden' },
  { value: 'vandalismus', label: 'Vandalismus' },
  { value: 'steinschlag', label: 'Steinschlag / Glasbruch' },
  { value: 'e-auto', label: 'E-Auto / Tesla / Batterie' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

const fieldCls =
  'w-full box-border rounded-ios-sm border-[1.5px] border-au-sand-dark bg-au-surface px-3.5 py-3 text-base text-au-ink focus-visible:border-au-amber focus-visible:outline-2 focus-visible:outline-au-amber'
const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-wide text-au-ink-soft'

export function LeadFormClient() {
  const sp = useSearchParams()
  const ref = sp.get('ref') ?? ''
  const presetTyp = sp.get('situation') ? '' : (sp.get('schadenstyp') ?? '')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SubmitLeadResult | null>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    startTransition(async () => {
      const res = await submitAutounfallLead(fd)
      setResult(res)
      if (res.ok) trackLeadSubmit(ref || undefined)
    })
  }

  if (result?.ok) {
    return (
      <div className="rounded-ios-md border border-au-success/30 bg-au-teal-50 p-6 sm:p-8">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-teal-700">
          Anfrage eingegangen
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-au-ink">Danke — wir melden uns.</h2>
        <p className="mt-3 leading-relaxed text-au-ink-soft">
          Ihre Anfrage ist bei uns eingegangen. Wir vermitteln Ihnen einen unabhängigen
          Sachverständigen in Ihrer Nähe und melden uns in der Regel innerhalb von 24 Stunden.
        </p>
        <p className="mt-4 text-sm text-au-muted">
          In der Zwischenzeit:{' '}
          <Link href="/unfall-assistance" className="font-semibold text-au-amber-dark underline">
            Unfall-Assistance starten
          </Link>{' '}
          — was Sie jetzt tun sollten.
        </p>
      </div>
    )
  }

  const fieldError = (f: string) => (result && !result.ok && result.field === f ? result.error : null)

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-ios-md border border-au-sand-dark bg-au-surface p-6 sm:p-8">
      {/* Hidden-Kontext aus ?query (UTM/ref/schadenstyp) */}
      <input type="hidden" name="ref" value={ref} />
      <input type="hidden" name="utm_source" value={sp.get('utm_source') ?? ''} />
      <input type="hidden" name="utm_medium" value={sp.get('utm_medium') ?? ''} />
      <input type="hidden" name="utm_campaign" value={sp.get('utm_campaign') ?? ''} />
      <input type="hidden" name="utm_term" value={sp.get('utm_term') ?? ''} />
      <input type="hidden" name="utm_content" value={sp.get('utm_content') ?? ''} />

      <div className="space-y-4">
        <div>
          <label htmlFor="lf-name" className={labelCls}>
            Name
          </label>
          <input id="lf-name" name="name" type="text" autoComplete="name" required placeholder="Vor- und Nachname" className={fieldCls} />
          {fieldError('name') ? <p className="mt-1 text-sm text-au-danger">{fieldError('name')}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lf-telefon" className={labelCls}>
              Telefon
            </label>
            <input id="lf-telefon" name="telefon" type="tel" autoComplete="tel" required placeholder="0221 1234567" className={fieldCls} />
            {fieldError('telefon') ? <p className="mt-1 text-sm text-au-danger">{fieldError('telefon')}</p> : null}
          </div>
          <div>
            <label htmlFor="lf-plz" className={labelCls}>
              Ort oder PLZ
            </label>
            <input id="lf-plz" name="plz_oder_stadt" type="text" autoComplete="address-level2" required placeholder="z. B. 50670 Köln" className={fieldCls} />
            {fieldError('plz_oder_stadt') ? <p className="mt-1 text-sm text-au-danger">{fieldError('plz_oder_stadt')}</p> : null}
          </div>
        </div>

        <div>
          <label htmlFor="lf-email" className={labelCls}>
            E-Mail <span className="font-normal normal-case text-au-muted">(optional)</span>
          </label>
          <input id="lf-email" name="email" type="email" autoComplete="email" placeholder="name@beispiel.de" className={fieldCls} />
          {fieldError('email') ? <p className="mt-1 text-sm text-au-danger">{fieldError('email')}</p> : null}
        </div>

        <div>
          <label htmlFor="lf-typ" className={labelCls}>
            Schadensart <span className="font-normal normal-case text-au-muted">(optional)</span>
          </label>
          <select id="lf-typ" name="schadenstyp" defaultValue={presetTyp} className={fieldCls}>
            <option value="">Bitte auswählen…</option>
            {SCHADENSTYPEN.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* DSGVO-Pflicht-Checkbox */}
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-au-ink-soft">
          <input type="checkbox" name="dsgvo" value="on" required className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-au-amber" />
          <span>
            Ich willige ein, dass meine Angaben zur Bearbeitung meiner Anfrage und zur Vermittlung
            eines Sachverständigen verarbeitet werden. Details in der{' '}
            <Link href="/datenschutz" className="font-semibold text-au-amber-dark underline">
              Datenschutzerklärung
            </Link>
            . Die Einwilligung ist jederzeit widerrufbar.
          </span>
        </label>
        {fieldError('dsgvo') ? <p className="text-sm text-au-danger">{fieldError('dsgvo')}</p> : null}

        {result && !result.ok && !result.field ? (
          <p className="rounded-ios-sm border border-au-danger/30 bg-au-danger/5 p-3 text-sm text-au-danger">
            {result.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          onClick={() => trackCtaClick('gutachter-finden-form')}
          className="inline-flex w-full items-center justify-center gap-2 rounded-ios-md bg-au-amber px-7 py-3.5 font-semibold text-au-surface shadow-au-md transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Wird gesendet…' : 'Sachverständigen anfragen'}
        </button>
        <p className="text-center text-xs text-au-muted">
          Bei unverschuldetem Unfall kostenfrei · § 249 BGB · keine Verpflichtung
        </p>
      </div>
    </form>
  )
}
