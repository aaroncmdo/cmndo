'use client'

// SvClaimClient.tsx — 4-Schritt SV-Basic-Claim-Flow fuer gutachter-partner LP.
// Repliziert SvRegistrierenClient aus dem Haupt-App-Flow (src/app/sv/registrieren/).
// Verwendet marketing-app Primitives (Input, Button) + inline-DE-Strings.
// Kein Export von Typen aus 'use server'-Files (AAR-664).

import { useState, useTransition } from 'react'
import {
  SearchIcon,
  MapPinIcon,
  BadgeCheckIcon,
  ClockIcon,
  CheckIcon,
  ArrowLeftIcon,
  UserPlusIcon,
  ShieldCheckIcon,
  ChevronRightIcon,
} from 'lucide-react'
import { Button, Input } from '@/components/primitives'
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

// ─── Geteilte Layout-Bausteine ────────────────────────────────────────────────

/**
 * Premium-Karten-Shell für alle vier Schritte. Solide weiße Card mit großem
 * iOS-Radius + Claimondo-Shadow + dezentem Border. min-h hält die linke Spalte
 * auf Augenhöhe mit der hohen Karte rechts (Balance-Fix).
 */
function FlowCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[460px] flex-col rounded-ios-lg border border-claimondo-border bg-white p-6 shadow-claimondo-lg sm:p-7">
      {children}
    </div>
  )
}

/** Kleines Eyebrow mit pulsierendem Punkt — Conversion-Signal über der Headline. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
      <span className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
        {children}
      </span>
    </div>
  )
}

/** Eine Trust-Badge (Icon + Label) — füllt die luftige Suchkarte. */
function TrustBadge({
  icon: Icon,
  children,
}: {
  icon: typeof CheckIcon
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-claimondo-border bg-claimondo-bg px-3 py-1.5 text-xs font-semibold text-claimondo-shield">
      <Icon className="h-3.5 w-3.5 text-claimondo-ondo" aria-hidden />
      {children}
    </span>
  )
}

/** Zurück-Affordance als Pill — kein nackter Text-Link mehr. */
function ZurueckPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-5 inline-flex items-center gap-1.5 self-start rounded-full border border-claimondo-border bg-claimondo-bg px-3 py-1.5 text-xs font-semibold text-claimondo-shield transition-colors hover:border-claimondo-ondo hover:text-claimondo-navy"
    >
      <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
      Zurück zur Suche
    </button>
  )
}

/** Einheitliches Feld-Label über den Inputs. */
function FeldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-sm font-semibold tracking-[-.01em] text-claimondo-navy">
      {children}
    </span>
  )
}

/** Inline-Fehlermeldung im semantischen Rot-Tint. */
function Fehlertext({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-ios-sm border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
      {children}
    </p>
  )
}

// ─── Schritt 1: Suche ─────────────────────────────────────────────────────────

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
    <FlowCard>
      <Eyebrow>Partner-Pool</Eyebrow>
      <h2 className="text-xl font-bold tracking-[-.02em] text-claimondo-navy">
        Finde deinen Eintrag
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-claimondo-shield">
        Wir führen bereits tausende Kfz-Sachverständige im Pool. Such dich, übernimm
        deinen Eintrag — oder trag dich neu ein. Beides kostenlos.
      </p>

      {/* Suchfeld + Button */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block">
            <FeldLabel>Name, Firma, PLZ oder DAT-Nummer</FeldLabel>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="z. B. Müller, 42103 oder DAT-12345"
              size="md"
              ariaLabel="Name, Firma, PLZ oder DAT-Nummer"
            />
          </label>
        </div>
        <Button
          variant="navy"
          size="md"
          onClick={handleSuchen}
          loading={isPending}
          iconLeft={<SearchIcon className="h-4 w-4" aria-hidden />}
          className="sm:self-end"
        >
          Suchen
        </Button>
      </div>

      {fehler && <Fehlertext>{fehler}</Fehlertext>}

      {/* Ergebnisliste */}
      {gesucht && !isPending && (
        <div className="mt-5">
          {kandidaten.length === 0 ? (
            <div className="rounded-ios-md border border-dashed border-claimondo-border bg-claimondo-bg px-4 py-5 text-center">
              <p className="text-sm font-medium text-claimondo-navy">
                Kein passender Eintrag gefunden.
              </p>
              <p className="mt-1 text-xs text-claimondo-shield">
                Macht nichts — trag dich unten einfach neu ein.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {kandidaten.map((k) => (
                <li key={k.id}>
                  <KandidatKarte kandidat={k} onWaehlen={() => onKandidatGewaehlt(k)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Trust-Badges — füllen die luftige Karte + senken die Hürde */}
      {!gesucht && (
        <div className="mt-5 flex flex-wrap gap-2">
          <TrustBadge icon={CheckIcon}>Kostenlos</TrustBadge>
          <TrustBadge icon={ClockIcon}>Freischaltung in 48 Std.</TrustBadge>
          <TrustBadge icon={BadgeCheckIcon}>DAT / BVSK willkommen</TrustBadge>
        </div>
      )}

      {/* Sekundär-Affordance: Neu eintragen — schiebt sich ans Karten-Ende */}
      <div className="mt-auto border-t border-claimondo-border pt-5">
        <button
          type="button"
          onClick={onNeuEintragen}
          className="group flex w-full items-center justify-between gap-3 rounded-ios-md border border-claimondo-border bg-claimondo-bg px-4 py-3 text-left transition-colors hover:border-claimondo-ondo"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo/10 text-claimondo-ondo">
              <UserPlusIcon className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-claimondo-navy">
                Noch nicht im Pool?
              </span>
              <span className="block text-xs text-claimondo-shield">
                Neu eintragen — dauert keine 3 Minuten.
              </span>
            </span>
          </span>
          <ChevronRightIcon
            className="h-4 w-4 flex-shrink-0 text-claimondo-ondo transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </button>
      </div>
    </FlowCard>
  )
}

/** Premium-Ergebniskarte für einen gefundenen SV-Lead. */
function KandidatKarte({
  kandidat,
  onWaehlen,
}: {
  kandidat: Kandidat
  onWaehlen: () => void
}) {
  const ort = kandidatOrt(kandidat)
  return (
    <div className="flex items-center justify-between gap-3 rounded-ios-md border border-claimondo-border bg-white px-4 py-3 transition-all hover:border-claimondo-ondo hover:shadow-claimondo-md">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo/10 text-claimondo-ondo">
          <MapPinIcon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-claimondo-navy">
            {kandidatLabel(kandidat)}
          </p>
          {ort && <p className="mt-0.5 truncate text-xs text-claimondo-shield">{ort}</p>}
        </div>
      </div>
      <Button variant="ondo" size="sm" onClick={onWaehlen} className="flex-shrink-0">
        Das bin ich
      </Button>
    </div>
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

  const ort = kandidatOrt(kandidat)

  return (
    <FlowCard>
      <ZurueckPill onClick={onZurueck} />

      <Eyebrow>Schritt 2 von 2</Eyebrow>
      <h2 className="text-xl font-bold tracking-[-.02em] text-claimondo-navy">
        Eintrag beanspruchen
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-claimondo-shield">
        Bestätige deine Kontaktdaten, um diesen Eintrag zu übernehmen.
      </p>

      {/* Gewählter Kandidat — read-only Highlight-Card */}
      <div className="mt-5 flex items-center gap-3 rounded-ios-md border border-claimondo-ondo/30 bg-claimondo-ondo/5 px-4 py-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo/15 text-claimondo-ondo">
          <MapPinIcon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
            Dein Eintrag
          </p>
          <p className="truncate text-sm font-semibold text-claimondo-navy">
            {kandidatLabel(kandidat)}
          </p>
          {ort && <p className="truncate text-xs text-claimondo-shield">{ort}</p>}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <label className="block">
          <FeldLabel>E-Mail-Adresse</FeldLabel>
          <Input
            value={email}
            onChangeText={setEmail}
            inputType="email"
            placeholder="deine@email.de"
            size="md"
            ariaLabel="E-Mail-Adresse"
          />
        </label>
        <label className="block">
          <FeldLabel>Telefonnummer</FeldLabel>
          <Input
            value={telefon}
            onChangeText={setTelefon}
            inputType="tel"
            placeholder="+49 151 12345678"
            size="md"
            ariaLabel="Telefonnummer"
          />
        </label>
      </div>

      {fehler && <Fehlertext>{fehler}</Fehlertext>}

      <div className="mt-auto pt-5">
        <Button variant="navy" size="lg" fullWidth onClick={handleBeanspruchen} loading={isPending}>
          Jetzt beanspruchen
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-claimondo-shield">
          <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          Kostenlos — Freischaltung erst nach unserer Prüfung.
        </p>
      </div>
    </FlowCard>
  )
}

// ─── Schritt 3: Neu registrieren ──────────────────────────────────────────────

function NeuSchritt({
  onErfolg,
  onZurueck,
  onPlzErkannt,
}: {
  onErfolg: (email: string, emailSent: boolean) => void
  onZurueck: () => void
  onPlzErkannt?: (plz: string) => void
}) {
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [adresse, setAdresse] = useState('')
  const [plz, setPlz] = useState('')
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
    <FlowCard>
      <ZurueckPill onClick={onZurueck} />

      <Eyebrow>Neu im Pool</Eyebrow>
      <h2 className="text-xl font-bold tracking-[-.02em] text-claimondo-navy">
        Jetzt neu eintragen
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-claimondo-shield">
        Leg dein Profil an. Nach unserer Prüfung schalten wir dich frei — kostenlos
        und ohne Bindung.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <FeldLabel>Vorname *</FeldLabel>
            <Input
              value={vorname}
              onChangeText={setVorname}
              placeholder="Max"
              size="md"
              ariaLabel="Vorname"
            />
          </label>
          <label className="block">
            <FeldLabel>Nachname *</FeldLabel>
            <Input
              value={nachname}
              onChangeText={setNachname}
              placeholder="Mustermann"
              size="md"
              ariaLabel="Nachname"
            />
          </label>
        </div>
        <label className="block">
          <FeldLabel>E-Mail-Adresse *</FeldLabel>
          <Input
            value={email}
            onChangeText={setEmail}
            inputType="email"
            placeholder="deine@email.de"
            size="md"
            ariaLabel="E-Mail-Adresse"
          />
        </label>
        <label className="block">
          <FeldLabel>Telefonnummer *</FeldLabel>
          <Input
            value={telefon}
            onChangeText={setTelefon}
            inputType="tel"
            placeholder="+49 151 12345678"
            size="md"
            ariaLabel="Telefonnummer"
          />
        </label>
        <label className="block">
          <FeldLabel>Adresse (Straße + Hausnummer, Ort) *</FeldLabel>
          <Input
            value={adresse}
            onChangeText={setAdresse}
            placeholder="Musterstraße 1, 42103 Wuppertal"
            size="md"
            ariaLabel="Adresse"
          />
        </label>
        <label className="block">
          <FeldLabel>PLZ (optional)</FeldLabel>
          <Input
            value={plz}
            onChangeText={(value) => {
              setPlz(value)
              if (/^\d{5}$/.test(value)) onPlzErkannt?.(value)
            }}
            placeholder="42103"
            size="md"
            maxLength={5}
            ariaLabel="PLZ"
          />
        </label>
        <label className="block">
          <FeldLabel>DAT-Nummer *</FeldLabel>
          <Input
            value={datNr}
            onChangeText={setDatNr}
            placeholder="DAT-12345 (Identitätsnachweis für die Freigabe)"
            size="md"
            ariaLabel="DAT-Nummer"
          />
          <p className="mt-1.5 text-xs text-claimondo-shield">
            Deine DAT-Sachverständigennummer — wird zur Identitätsprüfung benötigt.
          </p>
        </label>
      </div>

      {fehler && <Fehlertext>{fehler}</Fehlertext>}

      <div className="mt-auto pt-5">
        <Button variant="navy" size="lg" fullWidth onClick={handleRegistrieren} loading={isPending}>
          Registrierung absenden
        </Button>
        <p className="mt-4 text-xs leading-relaxed text-claimondo-shield">
          Mit dem Absenden stimmst du unseren{' '}
          <a href="/agb" className="underline hover:text-claimondo-ondo">Nutzungsbedingungen</a>{' '}
          und der{' '}
          <a href="/datenschutz" className="underline hover:text-claimondo-ondo">Datenschutzerklärung</a>{' '}
          zu.
        </p>
      </div>
    </FlowCard>
  )
}

// ─── Schritt 4: Bestätigung ───────────────────────────────────────────────────

function BestaetigungSchritt({ email, emailSent }: { email: string; emailSent: boolean }) {
  return (
    <FlowCard>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4 text-center">
        {/* Erfolgs-Icon mit weichem Ring */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
          <CheckIcon className="h-8 w-8 text-emerald-600" strokeWidth={2.5} aria-hidden />
        </div>
        <h2 className="text-2xl font-bold tracking-[-.02em] text-claimondo-navy">
          Fast geschafft!
        </h2>
        <p className="max-w-sm text-sm leading-relaxed text-claimondo-shield">
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
              nicht zugestellt werden — du kannst dein Passwort jederzeit über
              „Passwort vergessen" mit der Adresse{' '}
              <strong className="text-claimondo-navy">{email}</strong> setzen. Nach
              unserer Prüfung (innerhalb von 48 Stunden) schalten wir dein Profil frei.
            </>
          )}
        </p>

        {/* Nächste-Schritte-Mini-Stepper — gibt dem Erfolg Substanz */}
        <div className="mt-2 w-full max-w-sm rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4 text-left">
          <ol className="flex flex-col gap-3">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo/10 text-[11px] font-bold text-claimondo-ondo">
                1
              </span>
              <span className="text-xs leading-relaxed text-claimondo-shield">
                Passwort über den Link in der E-Mail festlegen.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo/10 text-[11px] font-bold text-claimondo-ondo">
                2
              </span>
              <span className="text-xs leading-relaxed text-claimondo-shield">
                Wir prüfen deine Qualifikation — innerhalb von 48 Stunden.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo/10 text-[11px] font-bold text-claimondo-ondo">
                3
              </span>
              <span className="text-xs leading-relaxed text-claimondo-shield">
                Freischaltung — und erste Aufträge erscheinen in deiner Inbox.
              </span>
            </li>
          </ol>
        </div>

        <p className="text-xs text-claimondo-shield/70">
          Bitte prüfe auch deinen Spam-Ordner.
        </p>
      </div>
    </FlowCard>
  )
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export function SvClaimClient({ onPlzErkannt }: { onPlzErkannt?: (plz: string) => void } = {}) {
  const [schritt, setSchritt] = useState<Schritt>('suche')
  const [gewaehlterKandidat, setGewaehlterKandidat] = useState<Kandidat | null>(null)
  const [bestaetigungsEmail, setBestaetigungsEmail] = useState('')
  const [bestaetigungEmailSent, setBestaetigungEmailSent] = useState(true)

  function handleKandidatGewaehlt(k: Kandidat) {
    if (k.plz) onPlzErkannt?.(k.plz)
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
        kandidat={gewaehlterKandidat}
        onErfolg={handleErfolg}
        onZurueck={handleZurueckZurSuche}
      />
    )
  }

  if (schritt === 'neu') {
    return (
      <NeuSchritt
        onErfolg={handleErfolg}
        onZurueck={handleZurueckZurSuche}
        onPlzErkannt={onPlzErkannt}
      />
    )
  }

  // schritt === 'bestaetigung'
  return <BestaetigungSchritt email={bestaetigungsEmail} emailSent={bestaetigungEmailSent} />
}
