'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/primitives'
import { TextField } from '@/components/shared/forms'
import { werkstattPartnerAnfrage } from './actions'

type FormState = {
  firma: string
  ansprechpartner_vorname: string
  ansprechpartner_nachname: string
  email: string
  telefon: string
  plz: string
  ort: string
  marken: string
  nachricht: string
}

const EMPTY: FormState = {
  firma: '',
  ansprechpartner_vorname: '',
  ansprechpartner_nachname: '',
  email: '',
  telefon: '',
  plz: '',
  ort: '',
  marken: '',
  nachricht: '',
}

const TEXTAREA_CLS =
  'w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30'

export function WerkstattPartnerWerdenClient() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)

  function set(key: keyof FormState) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function submit() {
    setError(null)
    const fd = new FormData()
    for (const [k, v] of Object.entries(form)) fd.set(k, v)
    startTransition(async () => {
      const res = await werkstattPartnerAnfrage(fd)
      if (res.ok) setSuccess(true)
      else setError(res.error)
    })
  }

  if (success) {
    return (
      <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 text-center sm:p-8">
        <h2 className="text-xl font-bold text-claimondo-navy">Vielen Dank für Ihr Interesse!</h2>
        <p className="mt-3 text-sm text-claimondo-shield">
          Wir haben Ihre Anfrage erhalten. Unser Partner-Team meldet sich in Kürze bei Ihnen, um die
          Zusammenarbeit zu besprechen.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-ios-lg bg-claimondo-navy px-6 py-3 text-sm font-semibold text-white hover:bg-claimondo-shield"
          >
            Zurück zur Startseite
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Firma *"
          className="sm:col-span-2"
          value={form.firma}
          onChange={set('firma')}
          placeholder="Musterwerkstatt GmbH"
          autoComplete="organization"
        />
        <TextField
          label="Vorname"
          value={form.ansprechpartner_vorname}
          onChange={set('ansprechpartner_vorname')}
          placeholder="Max"
          autoComplete="given-name"
        />
        <TextField
          label="Nachname"
          value={form.ansprechpartner_nachname}
          onChange={set('ansprechpartner_nachname')}
          placeholder="Mustermann"
          autoComplete="family-name"
        />
        <TextField
          label="E-Mail *"
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="kontakt@musterwerkstatt.de"
          autoComplete="email"
        />
        <TextField
          label="Telefon"
          type="tel"
          value={form.telefon}
          onChange={set('telefon')}
          placeholder="0151 23456789"
          autoComplete="tel"
        />
        <TextField
          label="PLZ"
          value={form.plz}
          onChange={set('plz')}
          placeholder="50667"
          autoComplete="postal-code"
        />
        <TextField
          label="Ort"
          value={form.ort}
          onChange={set('ort')}
          placeholder="Köln"
          autoComplete="address-level2"
        />
        <TextField
          label="Marken / Spezialisierung"
          className="sm:col-span-2"
          value={form.marken}
          onChange={set('marken')}
          placeholder="z. B. VW, Audi, BMW — oder markenoffen"
        />
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold text-claimondo-shield">
          Nachricht (optional)
        </span>
        <textarea
          className={TEXTAREA_CLS}
          rows={4}
          value={form.nachricht}
          onChange={set('nachricht')}
          placeholder="Erzählen Sie uns kurz von Ihrer Werkstatt und warum Sie Partner werden möchten."
        />
      </label>

      {error ? <p className="mt-4 text-sm text-danger-strong">{error}</p> : null}

      <div className="mt-6">
        <Button onClick={submit} loading={pending}>
          Anfrage absenden
        </Button>
      </div>

      <p className="mt-4 text-xs text-claimondo-shield">
        Mit dem Absenden willigen Sie ein, dass wir Ihre Angaben zur Kontaktaufnahme und Prüfung
        einer Partnerschaft verarbeiten. Details in unserer{' '}
        <Link href="/datenschutz" className="underline hover:text-claimondo-navy">
          Datenschutzerklärung
        </Link>
        .
      </p>
    </div>
  )
}
