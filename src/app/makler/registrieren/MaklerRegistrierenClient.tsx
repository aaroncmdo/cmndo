'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/primitives'
import { registriereMaklerSelf } from './actions'
import { ShareTools } from '@/components/makler/ShareTools'
import { GesellschaftSelect } from '@/components/makler/GesellschaftSelect'
import { RECHTSFORM_OPTIONEN } from '@/lib/rechtsformen'

type GesellschaftOption = { id: string; name: string }

type FormState = {
  firma: string
  rechtsform: string
  ansprechpartner_vorname: string
  ansprechpartner_nachname: string
  email: string
  telefon: string
  adresse_plz: string
  adresse_ort: string
}

const EMPTY: FormState = {
  firma: '',
  rechtsform: '',
  ansprechpartner_vorname: '',
  ansprechpartner_nachname: '',
  email: '',
  telefon: '',
  adresse_plz: '',
  adresse_ort: '',
}

const inputClass =
  'w-full rounded-ios-md border border-claimondo-border px-4 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-ondo focus:border-claimondo-ondo focus:outline-none'

export function MaklerRegistrierenClient({
  versicherungen,
  maklerpools,
  werber = null,
  werberFirma = null,
  einladung = null,
}: {
  versicherungen: GesellschaftOption[]
  maklerpools: GesellschaftOption[]
  werber?: string | null
  werberFirma?: string | null
  /** Netzwerk-Kalt-Einladung: Token aus ?einladung= (Auto-Kante nach Registrierung). */
  einladung?: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ code: string | null } | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [einwilligung, setEinwilligung] = useState(false)
  const [kleinunternehmer, setKleinunternehmer] = useState(false)
  const [versicherungId, setVersicherungId] = useState<string | null>(null)
  const [maklerpoolId, setMaklerpoolId] = useState<string | null>(null)

  function set(key: keyof FormState) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function submit() {
    setError(null)
    const fd = new FormData()
    for (const [k, v] of Object.entries(form)) fd.set(k, v)
    fd.set('einwilligung', einwilligung ? 'true' : 'false')
    fd.set('kleinunternehmer', kleinunternehmer ? 'true' : 'false')
    if (versicherungId) fd.set('versicherung_id', versicherungId)
    if (maklerpoolId) fd.set('maklerpool_id', maklerpoolId)
    if (werber) fd.set('werber', werber)
    if (einladung) fd.set('einladung', einladung)
    startTransition(async () => {
      const res = await registriereMaklerSelf(fd)
      if (res.ok) setSuccess({ code: res.code })
      else setError(res.error)
    })
  }

  if (success) {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
    const url = success.code ? `${base}/m/${success.code}` : null
    return (
      <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 text-center sm:p-8">
        <h2 className="text-xl font-bold text-claimondo-navy">Willkommen bei Claimondo!</h2>
        <p className="mt-3 text-sm text-claimondo-shield">
          Ihr Makler-Konto ist aktiv. Wir haben Ihnen eine E-Mail geschickt, um Ihr Passwort zu
          setzen und sich einzuloggen.
        </p>
        {url ? (
          <div className="mt-5 rounded-ios-md bg-claimondo-bg p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-claimondo-ondo">
              Ihre Empfehlungs-Landeseite ist live
            </p>
            <a
              href={url}
              className="mt-1 block break-all text-sm font-semibold text-claimondo-navy underline"
            >
              {url.replace(/^https?:\/\//, '')}
            </a>
          </div>
        ) : null}
        {success.code ? (
          <div className="mt-5 text-left">
            <p className="mb-2 text-center text-sm font-semibold text-claimondo-navy">
              Teilen Sie Ihren Link — so gewinnen Sie sofort Kunden:
            </p>
            <ShareTools code={success.code} firma={form.firma} variant="quick" />
          </div>
        ) : null}
        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-ios-lg bg-claimondo-navy px-6 py-3 text-sm font-semibold text-white hover:bg-claimondo-shield"
          >
            Zum Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 sm:p-8">
      {werberFirma ? (
        <div className="mb-4 rounded-ios-md bg-claimondo-bg px-4 py-3 text-sm text-claimondo-navy">
          Eingeladen von <span className="font-semibold">{werberFirma}</span>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Firma *" className="sm:col-span-2">
          <input className={inputClass} value={form.firma} onChange={set('firma')} placeholder="Mustermakler GmbH" />
        </Field>
        <Field label="Vorname *">
          <input className={inputClass} value={form.ansprechpartner_vorname} onChange={set('ansprechpartner_vorname')} placeholder="Max" />
        </Field>
        <Field label="Nachname *">
          <input className={inputClass} value={form.ansprechpartner_nachname} onChange={set('ansprechpartner_nachname')} placeholder="Mustermann" />
        </Field>
        <Field label="E-Mail *">
          <input className={inputClass} type="email" value={form.email} onChange={set('email')} placeholder="max@mustermakler.de" />
        </Field>
        <Field label="Telefon *">
          <input className={inputClass} type="tel" value={form.telefon} onChange={set('telefon')} placeholder="0151 23456789" />
        </Field>
        <Field label="PLZ">
          <input className={inputClass} value={form.adresse_plz} onChange={set('adresse_plz')} placeholder="50667" />
        </Field>
        <Field label="Ort">
          <input className={inputClass} value={form.adresse_ort} onChange={set('adresse_ort')} placeholder="Köln" />
        </Field>
        <Field label="Rechtsform *" className="sm:col-span-2">
          <select
            className={inputClass}
            value={form.rechtsform}
            onChange={(e) => setForm((f) => ({ ...f, rechtsform: e.target.value }))}
          >
            {RECHTSFORM_OPTIONEN.map((o) => (
              <option key={o} value={o}>
                {o || '— wählen —'}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-5">
        <span className="mb-2 block text-xs font-semibold text-claimondo-ondo">Ihre Gesellschaft</span>
        <GesellschaftSelect
          versicherungen={versicherungen}
          maklerpools={maklerpools}
          versicherungId={versicherungId}
          maklerpoolId={maklerpoolId}
          onChange={({ versicherungId: v, maklerpoolId: p }) => {
            setVersicherungId(v)
            setMaklerpoolId(p)
          }}
        />
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm text-claimondo-shield">
        <input
          type="checkbox"
          checked={kleinunternehmer}
          onChange={(e) => setKleinunternehmer(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-claimondo-border"
        />
        <span>
          Ich bin Kleinunternehmer nach §19 UStG — Provisionsgutschriften werden ohne
          Umsatzsteuer ausgestellt.
        </span>
      </label>

      <label className="mt-5 flex items-start gap-3 text-sm text-claimondo-shield">
        <input
          type="checkbox"
          checked={einwilligung}
          onChange={(e) => setEinwilligung(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-claimondo-border"
        />
        <span>
          Ich möchte am Makler-Partnerprogramm teilnehmen und bin mit der Verarbeitung meiner Daten
          zu diesem Zweck einverstanden.
        </span>
      </label>

      {error ? <p className="mt-4 text-sm text-danger-strong">{error}</p> : null}

      <div className="mt-6">
        <Button onClick={submit} loading={pending}>
          Kostenlos registrieren
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-xs font-semibold text-claimondo-ondo">{label}</span>
      {children}
    </label>
  )
}
