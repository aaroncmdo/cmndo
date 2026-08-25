'use client'

// SvClaimClient.tsx — 4-Schritt SV-Basic-Claim-Flow fuer gutachter-partner LP.
// Repliziert SvRegistrierenClient aus dem Haupt-App-Flow (src/app/sv/registrieren/).
// Verwendet marketing-app Primitives (Input, Button, Card) + inline-DE-Strings.
// Kein Export von Typen aus 'use server'-Files (AAR-664).

import { useEffect, useState, useTransition } from 'react'
import { Button, Card, Input } from '@/components/primitives'
import {
  sucheSvLeadKandidaten,
  beanspracheSvLead,
  registriereSvBasicNeu,
} from '@/lib/sv-basic/claim-actions'

// ─── Lokale Typen (NICHT aus 'use server'-File re-exportiert) ─────────────────

type Kandidat = {
  id: string
  vorname: string | null
  name: string | null
  firma: string | null
  plz: string | null
  ort: string | null
}

type Schritt = 'suche' | 'beanspruchen' | 'neu' | 'bestaetigung'

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function kandidatLabel(k: Kandidat): string {
  if (k.firma) return k.firma
  const teile = [k.vorname, k.name].filter(Boolean)
  return teile.length > 0 ? teile.join(' ') : '(Unbekannt)'
}

function kandidatOrt(k: Kandidat): string {
  const teile = [k.plz, k.ort].filter(Boolean)
  return teile.join(' ')
}

// ─── Schritt 1: Suche ─────────────────────────────────────────────────────────

function SucheSchritt({
  initialQuery = '',
  onKandidatGewaehlt,
  onNeuEintragen,
  onPlzChange,
}: {
  initialQuery?: string
  onKandidatGewaehlt: (k: Kandidat) => void
  onNeuEintragen: () => void
  onPlzChange?: (plz: string) => void
}) {
  const [query, setQuery] = useState(initialQuery)

  // Sync, wenn der Parent eine neue PLZ reinschiebt (Pin-Klick auf der Karte).
  useEffect(() => {
    if (initialQuery) setQuery(initialQuery)
  }, [initialQuery])

  // Getippte 5-stellige PLZ an die Karte melden (treibt den Radius live).
  function handleQueryChange(v: string) {
    setQuery(v)
    const trimmed = v.trim()
    if (/^\d{5}$/.test(trimmed)) onPlzChange?.(trimmed)
  }
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
        <div className="flex-1">
          <label className="block">
            <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">
              Name, Firma, PLZ oder DAT-Nummer
            </span>
            <Input
              value={query}
              onChangeText={handleQueryChange}
              placeholder="z. B. Müller, 42103 oder DAT-12345"
              size="sm"
              ariaLabel="Name, Firma, PLZ oder DAT-Nummer"
            />
          </label>
        </div>
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
        <p className="mt-3 text-sm text-red-700">{fehler}</p>
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

// ─── Schritt 2: Beanspruchen ──────────────────────────────────────────────────

function BeanspruchenSchritt({
  kandidat,
  onErfolg,
  onZurueck,
}: {
  kandidat: Kandidat
  onErfolg: (email: string, emailSent: boolean) => void
  onZurueck: () => void
}) {
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
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
    startTransition(async () => {
      const res = await beanspracheSvLead({
        svLeadId: kandidat.id,
        email: email.trim(),
        telefon: telefon.trim(),
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
      <div className="mb-5 rounded-2xl border border-claimondo-border bg-claimondo-bg px-4 py-3">
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

      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">
            E-Mail-Adresse
          </span>
          <Input
            value={email}
            onChangeText={setEmail}
            inputType="email"
            placeholder="deine@email.de"
            size="sm"
            ariaLabel="E-Mail-Adresse"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">
            Telefonnummer
          </span>
          <Input
            value={telefon}
            onChangeText={setTelefon}
            inputType="tel"
            placeholder="+49 151 12345678"
            size="sm"
            ariaLabel="Telefonnummer"
          />
        </label>
      </div>

      {fehler && (
        <p className="mt-3 text-sm text-red-700">{fehler}</p>
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

// ─── Schritt 3: Neu registrieren ──────────────────────────────────────────────

function NeuSchritt({
  initialPlz = '',
  onErfolg,
  onZurueck,
}: {
  initialPlz?: string
  onErfolg: (email: string, emailSent: boolean) => void
  onZurueck: () => void
}) {
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [adresse, setAdresse] = useState('')
  const [plz, setPlz] = useState(initialPlz)
  const [datNr, setDatNr] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRegistrieren() {
    setFehler(null)
    if (!vorname.trim()) { setFehler('Vorname ist ein Pflichtfeld.'); return }
    if (!nachname.trim()) { setFehler('Nachname ist ein Pflichtfeld.'); return }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFehler('Bitte eine gültige E-Mail-Adresse eingeben.'); return
    }
    if (!telefon.trim() || telefon.trim().length < 5) {
      setFehler('Bitte eine gültige Telefonnummer eingeben.'); return
    }
    if (!adresse.trim()) { setFehler('Adresse ist ein Pflichtfeld.'); return }
    if (!datNr.trim()) { setFehler('DAT-Nummer ist ein Pflichtfeld.'); return }

    startTransition(async () => {
      const res = await registriereSvBasicNeu({
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        email: email.trim(),
        telefon: telefon.trim(),
        adresse: adresse.trim(),
        plz: plz.trim() || undefined,
        datNr: datNr.trim(),
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">
              Vorname *
            </span>
            <Input
              value={vorname}
              onChangeText={setVorname}
              placeholder="Max"
              size="sm"
              ariaLabel="Vorname"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">
              Nachname *
            </span>
            <Input
              value={nachname}
              onChangeText={setNachname}
              placeholder="Mustermann"
              size="sm"
              ariaLabel="Nachname"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">
            E-Mail-Adresse *
          </span>
          <Input
            value={email}
            onChangeText={setEmail}
            inputType="email"
            placeholder="deine@email.de"
            size="sm"
            ariaLabel="E-Mail-Adresse"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">
            Telefonnummer *
          </span>
          <Input
            value={telefon}
            onChangeText={setTelefon}
            inputType="tel"
            placeholder="+49 151 12345678"
            size="sm"
            ariaLabel="Telefonnummer"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">
            Adresse (Straße + Hausnummer, Ort) *
          </span>
          <Input
            value={adresse}
            onChangeText={setAdresse}
            placeholder="Musterstraße 1, 42103 Wuppertal"
            size="sm"
            ariaLabel="Adresse"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">
            PLZ (optional)
          </span>
          <Input
            value={plz}
            onChangeText={setPlz}
            placeholder="42103"
            size="sm"
            maxLength={5}
            ariaLabel="PLZ"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">
            DAT-Nummer *
          </span>
          <Input
            value={datNr}
            onChangeText={setDatNr}
            placeholder="DAT-12345 (Identitätsnachweis für die Freigabe)"
            size="sm"
            ariaLabel="DAT-Nummer"
          />
          <p className="mt-1.5 text-xs text-claimondo-shield">
            Deine DAT-Sachverständigennummer – wird zur Identitätsprüfung benötigt.
          </p>
        </label>
      </div>

      {fehler && (
        <p className="mt-3 text-sm text-red-700">{fehler}</p>
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

// ─── Schritt 4: Bestätigung ───────────────────────────────────────────────────

function BestaetigungSchritt({ email, emailSent }: { email: string; emailSent: boolean }) {
  return (
    <Card p={6} accentColor="success">
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <svg
            aria-hidden
            className="h-7 w-7 text-emerald-600"
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
              damit legst du dein Passwort fest. Nach unserer Prüfung (innerhalb von
              48 Stunden) schalten wir dein Profil frei.
            </>
          ) : (
            <>
              Dein Konto wurde angelegt. Die E-Mail mit dem Passwort-Link konnte gerade
              nicht zugestellt werden – du kannst dein Passwort jederzeit über
              „Passwort vergessen" mit der Adresse{' '}
              <strong className="text-claimondo-navy">{email}</strong> setzen. Nach
              unserer Prüfung (innerhalb von 48 Stunden) schalten wir dein Profil frei.
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

export function SvClaimClient({
  initialQuery = '',
  onPlzChange,
}: {
  initialQuery?: string
  onPlzChange?: (plz: string) => void
} = {}) {
  const [schritt, setSchritt] = useState<Schritt>('suche')
  const [gewaehlterKandidat, setGewaehlterKandidat] = useState<Kandidat | null>(null)
  const [bestaetigungsEmail, setBestaetigungsEmail] = useState('')
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
        initialQuery={initialQuery}
        onKandidatGewaehlt={handleKandidatGewaehlt}
        onNeuEintragen={handleNeuEintragen}
        onPlzChange={onPlzChange}
      />
    )
  }

  if (schritt === 'beanspruchen' && gewaehlterKandidat) {
    return (
      <BeanspruchenSchritt
        kandidat={gewaehlterKandidat}
        onErfolg={handleErfolg}
        onZurueck={handleZurueckZurSuche}
      />
    )
  }

  if (schritt === 'neu') {
    return (
      <NeuSchritt
        initialPlz={/^\d{5}$/.test(initialQuery) ? initialQuery : ''}
        onErfolg={handleErfolg}
        onZurueck={handleZurueckZurSuche}
      />
    )
  }

  // schritt === 'bestaetigung'
  return <BestaetigungSchritt email={bestaetigungsEmail} emailSent={bestaetigungEmailSent} />
}
