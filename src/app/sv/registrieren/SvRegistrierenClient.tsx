'use client'

import { useState, useTransition } from 'react'
import { Button, Card } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { SelectField } from '@/components/shared/forms/SelectField'
import { RECHTSFORM_OPTIONEN } from '@/lib/rechtsformen'
import {
  sucheSvLeadKandidaten,
  beanspracheSvLead,
  registriereSvBasicNeu,
} from '@/lib/sv-basic/claim-actions'
import { PAKETE, BASIC_PAKET } from '@/lib/pakete'

// ─── lokale Typen (NICHT aus 'use server'-File re-exportiert — AAR-664) ──────

type Kandidat = {
  id: string
  vorname: string | null
  name: string | null
  firma: string | null
  plz: string | null
  ort: string | null
}

type Schritt = 'suche' | 'beanspruchen' | 'neu' | 'bestaetigung'

// ─── Hilfsfunktion: Anzeigename für Kandidaten ───────────────────────────────

function kandidatLabel(k: Kandidat): string {
  if (k.firma) return k.firma
  const teile = [k.vorname, k.name].filter(Boolean)
  return teile.length > 0 ? teile.join(' ') : '(Unbekannt)'
}

function kandidatOrt(k: Kandidat): string {
  const teile = [k.plz, k.ort].filter(Boolean)
  return teile.join(' ')
}

// ─── Paket-Picker (Self-Service Paketauswahl) ────────────────────────────────
// Basic = gratis/Pay-per-Lead (sofort ins Onboarding). Bezahlte Pakete ziehen
// Preis/Faelle/Radius aus der SSoT (@/lib/pakete) — nach der Registrierung
// laeuft der SV in den reichen Vertrag+Anzahlung-Flow (willkommen).

const PAKET_OPTIONEN = [
  { key: BASIC_PAKET.key, name: BASIC_PAKET.name, preis: BASIC_PAKET.preis, untertitel: 'Pay-per-Lead · keine Grundgebühr' },
  { key: PAKETE.standard.key, name: PAKETE.standard.name, preis: PAKETE.standard.preis, untertitel: `${PAKETE.standard.faelle} Fälle/Monat · ${PAKETE.standard.radius_km} km Umkreis` },
  { key: PAKETE.pro.key, name: PAKETE.pro.name, preis: PAKETE.pro.preis, untertitel: `${PAKETE.pro.faelle} Fälle/Monat · ${PAKETE.pro.radius_km} km Umkreis` },
  { key: PAKETE.premium.key, name: PAKETE.premium.name, preis: PAKETE.premium.preis, untertitel: `${PAKETE.premium.faelle} Fälle/Monat · ${PAKETE.premium.radius_km} km Umkreis` },
] as const

function PaketPicker({ paket, onChange }: { paket: string; onChange: (p: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-claimondo-navy">Paket wählen</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PAKET_OPTIONEN.map((opt) => {
          const aktiv = paket === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              aria-pressed={aktiv}
              className={`rounded-ios-md border p-3 text-left transition-colors ${
                aktiv
                  ? 'border-claimondo-ondo bg-claimondo-ondo/5'
                  : 'border-claimondo-border bg-white hover:border-claimondo-ondo/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-claimondo-navy">{opt.name}</span>
                <span className="text-sm font-bold text-claimondo-ondo">
                  {opt.preis === 0 ? 'gratis' : `${opt.preis.toLocaleString('de-DE')} €`}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-claimondo-shield">{opt.untertitel}</p>
            </button>
          )
        })}
      </div>
      {paket !== 'basic' && (
        <p className="text-xs text-claimondo-shield">
          Vertrag + Anzahlung schließt du nach der Registrierung im Portal ab.
        </p>
      )}
      {/* P5 T10 (WS F): Freemium-Framing — Registrierung bleibt frei/Basic-first,
          der Netzwerkpartner-Vorteil ist optional im Portal aktivierbar (T8/T9). */}
      <p className="text-xs text-claimondo-shield">
        Tipp: Den <span className="font-semibold">Netzwerkpartner</span>-Vorteil (bevorzugte
        Platzierung im Finder deiner Kunden) kannst du jederzeit optional im Portal aktivieren.
      </p>
    </div>
  )
}

// ─── Firmen-/Steuerdaten (nur bezahlte Pakete) ───────────────────────────────
// Fuellen die Stammdaten-Card im Vertrag-Step des WillkommenClient + die Abrechnung.
// Basic bleibt schlank (keine Firmendaten noetig — Pay-per-Lead).

type BusinessDaten = { firmenname: string; rechtsform: string; steuernummer: string; ustId: string }

const BUSINESS_LEER: BusinessDaten = { firmenname: '', rechtsform: '', steuernummer: '', ustId: '' }

function validiereBusinessClient(b: BusinessDaten): string | null {
  if (!b.firmenname.trim()) return 'Firmenname ist bei bezahlten Paketen ein Pflichtfeld.'
  if (!b.rechtsform.trim()) return 'Bitte wähle deine Rechtsform.'
  if (!b.steuernummer.trim()) return 'Steuernummer ist bei bezahlten Paketen ein Pflichtfeld.'
  return null
}

function BusinessDatenFelder({
  business,
  onChange,
}: {
  business: BusinessDaten
  onChange: (b: BusinessDaten) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-claimondo-navy">
        Firmendaten (für Vertrag + Abrechnung)
      </p>
      <TextField
        label="Firmenname *"
        placeholder="KFZ-Sachverständigenbüro Muster GmbH"
        value={business.firmenname}
        onChange={(e) => onChange({ ...business, firmenname: e.target.value })}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Rechtsform *"
          value={business.rechtsform}
          onChange={(e) => onChange({ ...business, rechtsform: e.target.value })}
          options={RECHTSFORM_OPTIONEN.map((o) => ({ value: o, label: o || '— wählen —' }))}
        />
        <TextField
          label="Steuernummer *"
          placeholder="123/456/78901"
          value={business.steuernummer}
          onChange={(e) => onChange({ ...business, steuernummer: e.target.value })}
        />
      </div>
      <TextField
        label="USt-IdNr. (optional)"
        placeholder="DE123456789"
        value={business.ustId}
        onChange={(e) => onChange({ ...business, ustId: e.target.value })}
      />
    </div>
  )
}

// ─── Schritt 1: Suche ────────────────────────────────────────────────────────

function SucheSchritt({
  onKandidatGewaehlt,
  onNeuEintragen,
}: {
  onKandidatGewaehlt: (k: Kandidat) => void
  onNeuEintragen: () => void
}) {
  const [query, setQuery] = useState('')
  const [kandidaten, setKandidaten] = useState<Kandidat[]>([])
  const [gesucht, setGesucht] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSuchen() {
    if (query.trim().length < 2) {
      setFehler('Bitte mindestens 2 Zeichen eingeben.')
      return
    }
    setFehler(null)
    startTransition(async () => {
      const res = await sucheSvLeadKandidaten(query.trim())
      if (!res.ok) {
        setFehler(res.error)
        setKandidaten([])
      } else {
        setKandidaten(res.kandidaten)
        setGesucht(true)
      }
    })
  }

  return (
    <Card p={6}>
      <h2 className="mb-1 text-lg font-bold text-claimondo-navy">
        Finde deinen Eintrag
      </h2>
      <p className="mb-5 text-sm text-claimondo-shield">
        Suche nach deinem Namen, deiner Firma, PLZ oder DAT-Nummer.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextField
          label="Name, Firma, PLZ oder DAT-Nummer"
          placeholder="z. B. Müller, 42103 oder DAT-12345"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSuchen() }}
          className="flex-1"
        />
        <Button
          variant="navy"
          onClick={handleSuchen}
          loading={isPending}
          className="sm:self-end"
        >
          Suchen
        </Button>
      </div>

      {fehler && (
        <p className="mt-3 text-sm text-danger-strong">{fehler}</p>
      )}

      {gesucht && !isPending && (
        <div className="mt-5">
          {kandidaten.length === 0 ? (
            <p className="text-sm text-claimondo-shield">
              Kein passender Eintrag gefunden.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {kandidaten.map((k) => (
                <li key={k.id}>
                  <Card p={4} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-claimondo-navy text-sm">
                        {kandidatLabel(k)}
                      </p>
                      {kandidatOrt(k) && (
                        <p className="text-xs text-claimondo-shield mt-0.5">
                          {kandidatOrt(k)}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ondo"
                      size="sm"
                      onClick={() => onKandidatGewaehlt(k)}
                    >
                      Das bin ich
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-6 border-t border-claimondo-border pt-5">
        <p className="text-sm text-claimondo-shield">
          Mein Eintrag ist nicht dabei?
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNeuEintragen}
          className="mt-2"
        >
          Neu eintragen
        </Button>
      </div>
    </Card>
  )
}

// ─── Schritt 2: Beanspruchen ─────────────────────────────────────────────────

function BeanspruchenSchritt({
  kandidat,
  onErfolg,
  onZurueck,
  einladung,
}: {
  kandidat: Kandidat
  onErfolg: (email: string, emailSent: boolean) => void
  onZurueck: () => void
  einladung?: string
}) {
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [paket, setPaket] = useState('basic')
  const [business, setBusiness] = useState<BusinessDaten>(BUSINESS_LEER)
  const [fehler, setFehler] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleBeanspruchen() {
    setFehler(null)
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFehler('Bitte eine gültige E-Mail-Adresse eingeben.')
      return
    }
    if (!telefon.trim() || telefon.trim().length < 5) {
      setFehler('Bitte eine gültige Telefonnummer eingeben.')
      return
    }
    if (paket !== 'basic') {
      const bErr = validiereBusinessClient(business)
      if (bErr) { setFehler(bErr); return }
    }
    startTransition(async () => {
      const res = await beanspracheSvLead({
        svLeadId: kandidat.id,
        einladungToken: einladung,
        email: email.trim(),
        telefon: telefon.trim(),
        paket,
        ...(paket !== 'basic'
          ? {
              firmenname: business.firmenname.trim(),
              rechtsform: business.rechtsform,
              steuernummer: business.steuernummer.trim(),
              ustId: business.ustId.trim() || undefined,
            }
          : {}),
      })
      if (!res.ok) {
        setFehler(res.error)
      } else {
        onErfolg(email.trim(), res.emailSent)
      }
    })
  }

  return (
    <Card p={6}>
      <button
        type="button"
        onClick={onZurueck}
        className="mb-4 text-xs font-semibold text-claimondo-ondo hover:underline"
      >
        ← Zurück zur Suche
      </button>

      <h2 className="mb-1 text-lg font-bold text-claimondo-navy">
        Eintrag beanspruchen
      </h2>
      <p className="mb-5 text-sm text-claimondo-shield">
        Bestätige deine Kontaktdaten, um diesen Eintrag zu übernehmen.
      </p>

      {/* Gewählter Kandidat – read-only */}
      <div className="mb-5 rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-shield mb-1">
          Ausgewählter Eintrag
        </p>
        <p className="font-semibold text-claimondo-navy text-sm">
          {kandidatLabel(kandidat)}
        </p>
        {kandidatOrt(kandidat) && (
          <p className="text-xs text-claimondo-shield mt-0.5">{kandidatOrt(kandidat)}</p>
        )}
      </div>

      <div className="mb-5">
        <PaketPicker paket={paket} onChange={setPaket} />
      </div>

      {paket !== 'basic' && (
        <div className="mb-5">
          <BusinessDatenFelder business={business} onChange={setBusiness} />
        </div>
      )}

      <div className="flex flex-col gap-4">
        <TextField
          label="E-Mail-Adresse"
          type="email"
          placeholder="deine@email.de"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <TextField
          label="Telefonnummer"
          type="tel"
          placeholder="+49 151 12345678"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          autoComplete="tel"
        />
      </div>

      {fehler && (
        <p className="mt-3 text-sm text-danger-strong">{fehler}</p>
      )}

      <div className="mt-5">
        <Button
          variant="navy"
          fullWidth
          onClick={handleBeanspruchen}
          loading={isPending}
        >
          Jetzt beanspruchen
        </Button>
      </div>
    </Card>
  )
}

// ─── Schritt 3: Neu registrieren ─────────────────────────────────────────────

function NeuSchritt({
  onErfolg,
  onZurueck,
  einladung,
}: {
  onErfolg: (email: string, emailSent: boolean) => void
  onZurueck: () => void
  einladung?: string
}) {
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [adresse, setAdresse] = useState('')
  const [plz, setPlz] = useState('')
  const [datNr, setDatNr] = useState('')
  const [paket, setPaket] = useState('basic')
  const [business, setBusiness] = useState<BusinessDaten>(BUSINESS_LEER)
  const [fehler, setFehler] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRegistrieren() {
    setFehler(null)
    // Client-seitige Pflichtfeld-Validierung
    if (!vorname.trim()) { setFehler('Vorname ist ein Pflichtfeld.'); return }
    if (!nachname.trim()) { setFehler('Nachname ist ein Pflichtfeld.'); return }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFehler('Bitte eine gültige E-Mail-Adresse eingeben.'); return
    }
    if (!telefon.trim() || telefon.trim().length < 5) {
      setFehler('Bitte eine gültige Telefonnummer eingeben.'); return
    }
    if (!adresse.trim()) { setFehler('Adresse ist ein Pflichtfeld.'); return }
    if (paket !== 'basic') {
      const bErr = validiereBusinessClient(business)
      if (bErr) { setFehler(bErr); return }
    }

    startTransition(async () => {
      const res = await registriereSvBasicNeu({
        einladungToken: einladung,
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        email: email.trim(),
        telefon: telefon.trim(),
        adresse: adresse.trim(),
        plz: plz.trim() || undefined,
        datNr: datNr.trim() || undefined,
        paket,
        ...(paket !== 'basic'
          ? {
              firmenname: business.firmenname.trim(),
              rechtsform: business.rechtsform,
              steuernummer: business.steuernummer.trim(),
              ustId: business.ustId.trim() || undefined,
            }
          : {}),
      })
      if (!res.ok) {
        setFehler(res.error)
      } else {
        onErfolg(email.trim(), res.emailSent)
      }
    })
  }

  return (
    <Card p={6}>
      <button
        type="button"
        onClick={onZurueck}
        className="mb-4 text-xs font-semibold text-claimondo-ondo hover:underline"
      >
        ← Zurück zur Suche
      </button>

      <h2 className="mb-1 text-lg font-bold text-claimondo-navy">
        Neu registrieren
      </h2>
      <p className="mb-5 text-sm text-claimondo-shield">
        Lege ein neues Profil an. Nach unserer Prüfung schalten wir dich frei.
      </p>

      <div className="flex flex-col gap-4">
        <PaketPicker paket={paket} onChange={setPaket} />
        {paket !== 'basic' && <BusinessDatenFelder business={business} onChange={setBusiness} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Vorname *"
            placeholder="Max"
            value={vorname}
            onChange={(e) => setVorname(e.target.value)}
            autoComplete="given-name"
          />
          <TextField
            label="Nachname *"
            placeholder="Mustermann"
            value={nachname}
            onChange={(e) => setNachname(e.target.value)}
            autoComplete="family-name"
          />
        </div>
        <TextField
          label="E-Mail-Adresse *"
          type="email"
          placeholder="deine@email.de"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <TextField
          label="Telefonnummer *"
          type="tel"
          placeholder="+49 151 12345678"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          autoComplete="tel"
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-claimondo-shield">Adresse (Straße + Hausnummer, Ort) *</label>
          {/* P2 Ortseingaben: Google-Places-Autocomplete füllt Adresse + PLZ. onChange hält den
              Freitext (Direkt-Submit ohne Dropdown-Auswahl → Server-Geocoding). PLZ bleibt editierbar. */}
          <GooglePlaceAutocomplete
            className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
            defaultValue={adresse}
            placeholder="Musterstraße 1, 42103 Wuppertal"
            onSelect={(r) => {
              setAdresse(r.adresse)
              if (r.plz) setPlz(r.plz)
            }}
            onChange={(t) => setAdresse(t)}
          />
        </div>
        <TextField
          label="PLZ (optional)"
          placeholder="42103"
          value={plz}
          onChange={(e) => setPlz(e.target.value)}
          autoComplete="postal-code"
        />
        <TextField
          label="DAT-Nummer (optional)"
          placeholder="z. B. DAT-12345"
          value={datNr}
          onChange={(e) => setDatNr(e.target.value)}
          hint="Optional — Sachverständige mit DAT-Nummer werden im Gutachter-Finder bevorzugt gelistet."
        />
      </div>

      {fehler && (
        <p className="mt-3 text-sm text-danger-strong">{fehler}</p>
      )}

      <div className="mt-5">
        <Button
          variant="navy"
          fullWidth
          onClick={handleRegistrieren}
          loading={isPending}
        >
          Registrierung absenden
        </Button>
      </div>

      <p className="mt-4 text-xs text-claimondo-shield">
        Mit dem Absenden stimmst du unseren{' '}
        <a href="/agb" className="underline hover:text-claimondo-ondo">Nutzungsbedingungen</a>{' '}
        und der{' '}
        <a href="/datenschutz" className="underline hover:text-claimondo-ondo">Datenschutzerklärung</a>{' '}
        zu.
      </p>
    </Card>
  )
}

// ─── Schritt 4: Bestätigung ──────────────────────────────────────────────────

function BestaetigungSchritt({ email, emailSent }: { email: string; emailSent: boolean }) {
  return (
    <Card p={6} accentColor="success">
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
          <svg
            aria-hidden
            className="h-7 w-7 text-success"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2
          className="text-xl font-bold text-claimondo-navy"
          style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
        >
          Fast geschafft!
        </h2>
        <p className="text-sm text-claimondo-shield leading-relaxed max-w-sm">
          {emailSent ? (
            <>
              Wir haben dir einen Link an{' '}
              <strong className="text-claimondo-navy">{email}</strong> geschickt —
              damit legst du dein Passwort fest. Danach führt dich unser Onboarding
              in wenigen Minuten zur Freischaltung deines Profils.
            </>
          ) : (
            <>
              Dein Konto wurde angelegt. Die E-Mail mit dem Passwort-Link konnte gerade
              nicht zugestellt werden — du kannst dein Passwort jederzeit über
              „Passwort vergessen" mit der Adresse{' '}
              <strong className="text-claimondo-navy">{email}</strong> setzen. Danach
              führt dich unser Onboarding in wenigen Minuten zur Freischaltung deines
              Profils.
            </>
          )}
        </p>
        <p className="text-xs text-claimondo-shield/70">
          Bitte prüfe auch deinen Spam-Ordner.
        </p>
      </div>
    </Card>
  )
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export function SvRegistrierenClient({ einladung }: { einladung?: string } = {}) {
  const [schritt, setSchritt] = useState<Schritt>('suche')
  const [gewaehlterKandidat, setGewaehlterKandidat] = useState<Kandidat | null>(null)
  const [bestaetigunsEmail, setBestaetigungsEmail] = useState('')
  const [bestaetigungEmailSent, setBestaetigungEmailSent] = useState(true)

  function handleKandidatGewaehlt(k: Kandidat) {
    setGewaehlterKandidat(k)
    setSchritt('beanspruchen')
  }

  function handleNeuEintragen() {
    setSchritt('neu')
  }

  function handleErfolg(email: string, emailSent: boolean) {
    setBestaetigungsEmail(email)
    setBestaetigungEmailSent(emailSent)
    setSchritt('bestaetigung')
  }

  function handleZurueckZurSuche() {
    setSchritt('suche')
  }

  if (schritt === 'suche') {
    return (
      <SucheSchritt
        onKandidatGewaehlt={handleKandidatGewaehlt}
        onNeuEintragen={handleNeuEintragen}
      />
    )
  }

  if (schritt === 'beanspruchen' && gewaehlterKandidat) {
    return (
      <BeanspruchenSchritt
        einladung={einladung}
        kandidat={gewaehlterKandidat}
        onErfolg={handleErfolg}
        onZurueck={handleZurueckZurSuche}
      />
    )
  }

  if (schritt === 'neu') {
    return (
      <NeuSchritt
        einladung={einladung}
        onErfolg={handleErfolg}
        onZurueck={handleZurueckZurSuche}
      />
    )
  }

  // schritt === 'bestaetigung'
  return <BestaetigungSchritt email={bestaetigunsEmail} emailSent={bestaetigungEmailSent} />
}
