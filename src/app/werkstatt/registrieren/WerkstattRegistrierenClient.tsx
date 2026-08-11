'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/primitives'
import { GEWERKE, type Gewerk } from '@/lib/werkstatt/bedarf/types'
import { registriereWerkstattSelf } from './actions'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'

// Anzeige-Labels zum kanonischen Gewerke-Vokabular (Werte = werkstaetten.faehigkeiten).
const GEWERK_LABEL: Record<Gewerk, string> = {
  karosserie: 'Karosserie',
  lackierung: 'Lackierung',
  mechanik: 'Mechanik',
  glas: 'Glas',
  smart_repair: 'Smart Repair',
}

type FormState = {
  firma: string
  ansprechpartner_vorname: string
  ansprechpartner_nachname: string
  email: string
  telefon: string
  adresse_strasse: string
  adresse_plz: string
  adresse_ort: string
}

const EMPTY: FormState = {
  firma: '',
  ansprechpartner_vorname: '',
  ansprechpartner_nachname: '',
  email: '',
  telefon: '',
  adresse_strasse: '',
  adresse_plz: '',
  adresse_ort: '',
}

const inputClass =
  'w-full rounded-ios-md border border-claimondo-border px-4 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-ondo focus:border-claimondo-ondo focus:outline-none'

export function WerkstattRegistrierenClient({ einladung }: { einladung?: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [faehigkeiten, setFaehigkeiten] = useState<Gewerk[]>([])
  const [kleinunternehmer, setKleinunternehmer] = useState(false)
  const [einwilligung, setEinwilligung] = useState(false)

  function set(key: keyof FormState) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  function toggleGewerk(g: Gewerk) {
    setFaehigkeiten((list) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g]))
  }

  function submit() {
    setError(null)
    const fd = new FormData()
    for (const [k, v] of Object.entries(form)) fd.set(k, v)
    for (const g of faehigkeiten) fd.append('faehigkeiten', g)
    fd.set('kleinunternehmer', kleinunternehmer ? 'true' : 'false')
    fd.set('einwilligung', einwilligung ? 'true' : 'false')
    if (einladung) fd.set('einladung', einladung)
    startTransition(async () => {
      const res = await registriereWerkstattSelf(fd)
      if (res.ok) setSuccess(true)
      else setError(res.error)
    })
  }

  if (success) {
    return (
      <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 text-center sm:p-8">
        <h2 className="text-xl font-bold text-claimondo-navy">Willkommen bei Claimondo!</h2>
        <p className="mt-3 text-sm text-claimondo-shield">
          Ihr Werkstatt-Konto ist aktiv. Wir haben Ihnen eine E-Mail geschickt, um Ihr Passwort zu
          setzen und sich einzuloggen.
        </p>
        <div className="mt-5 rounded-ios-md bg-claimondo-bg p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-claimondo-ondo">
            So starten Sie direkt
          </p>
          <ol className="mt-2 space-y-1.5 text-sm text-claimondo-navy list-decimal list-inside">
            <li>Passwort über den Link in der E-Mail setzen und einloggen.</li>
            <li>Im Portal unter „QR-Code" Ihren Aufsteller (A5-PDF) herunterladen und aushängen.</li>
            <li>Kunden scannen — Schadensmeldungen laufen automatisch über Ihre Werkstatt.</li>
          </ol>
        </div>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Werkstatt-Name *" className="sm:col-span-2">
          <input className={inputClass} value={form.firma} onChange={set('firma')} placeholder="KFZ-Werkstatt Muster GmbH" />
        </Field>
        <Field label="Vorname (Ansprechpartner) *">
          <input className={inputClass} value={form.ansprechpartner_vorname} onChange={set('ansprechpartner_vorname')} placeholder="Max" />
        </Field>
        <Field label="Nachname (Ansprechpartner) *">
          <input className={inputClass} value={form.ansprechpartner_nachname} onChange={set('ansprechpartner_nachname')} placeholder="Mustermann" />
        </Field>
        <Field label="E-Mail *">
          <input className={inputClass} type="email" value={form.email} onChange={set('email')} placeholder="info@werkstatt-muster.de" />
        </Field>
        <Field label="Telefon *">
          <input className={inputClass} type="tel" value={form.telefon} onChange={set('telefon')} placeholder="0221 1234567" />
        </Field>
        <Field label="Straße + Hausnummer *" className="sm:col-span-2">
          {/* P2 Ortseingaben: Google-Places-Autocomplete füllt Straße + PLZ + Ort in einem Schritt.
              onChange hält den Freitext (Direkt-Submit ohne Dropdown-Auswahl → Server-Geocoding).
              PLZ/Ort bleiben darunter editierbar (Korrektur/Fallback). */}
          <GooglePlaceAutocomplete
            className={inputClass}
            defaultValue={form.adresse_strasse}
            placeholder="Straße + Hausnummer eingeben…"
            onSelect={(r) =>
              setForm((f) => ({
                ...f,
                adresse_strasse: r.strasse || f.adresse_strasse,
                adresse_plz: r.plz || f.adresse_plz,
                adresse_ort: r.stadt || f.adresse_ort,
              }))
            }
            onChange={(t) => setForm((f) => ({ ...f, adresse_strasse: t }))}
          />
        </Field>
        <Field label="PLZ *">
          <input className={inputClass} value={form.adresse_plz} onChange={set('adresse_plz')} placeholder="50667" />
        </Field>
        <Field label="Ort *">
          <input className={inputClass} value={form.adresse_ort} onChange={set('adresse_ort')} placeholder="Köln" />
        </Field>
      </div>

      <div className="mt-5">
        <span className="mb-1 block text-xs font-semibold text-claimondo-ondo">
          Welche Arbeiten führen Sie aus? (optional)
        </span>
        <p className="mb-2 text-xs text-claimondo-shield">
          Mehrfachauswahl — stärkt Ihre Platzierung im Werkstatt-Finder.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GEWERKE.map((g) => (
            <label
              key={g}
              className="flex items-center gap-2 rounded-ios-md border border-claimondo-border px-3 py-2 text-sm text-claimondo-navy"
            >
              <input
                type="checkbox"
                checked={faehigkeiten.includes(g)}
                onChange={() => toggleGewerk(g)}
                className="h-4 w-4 shrink-0 rounded border-claimondo-border"
              />
              <span>{GEWERK_LABEL[g]}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="mt-5 flex items-start gap-3 text-sm text-claimondo-shield">
        <input
          type="checkbox"
          checked={kleinunternehmer}
          onChange={(e) => setKleinunternehmer(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-claimondo-border"
        />
        <span>
          Wir sind Kleinunternehmer nach §19 UStG — Provisionsgutschriften werden ohne
          Umsatzsteuer ausgestellt.
        </span>
      </label>

      <label className="mt-4 flex items-start gap-3 text-sm text-claimondo-shield">
        <input
          type="checkbox"
          checked={einwilligung}
          onChange={(e) => setEinwilligung(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-claimondo-border"
        />
        <span>
          Wir möchten am Werkstatt-Partnerprogramm teilnehmen und sind mit der Verarbeitung
          unserer Daten zu diesem Zweck einverstanden.
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
