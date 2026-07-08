'use client'

// Einstellungen-Client fuer Werkstatt-Partner: Profil / Bankdaten / Passwort.
// Gespiegelt nach MaklerSettings.tsx, aber component-set-konform: shared
// forms/TextField + primitives.Button statt handgerollter <input>/<button>.

import { useState, useTransition } from 'react'
import {
  UserIcon,
  LandmarkIcon,
  KeyRoundIcon,
  LogOutIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
} from 'lucide-react'
import {
  updateWerkstattProfil,
  updateWerkstattBank,
  changeWerkstattPasswort,
} from '@/lib/actions/werkstatt-settings'
import { SectionCard as SharedSectionCard } from '@/components/shared/SectionCard'
import { TextField } from '@/components/shared/forms'
import { Button } from '@/components/primitives/Button'

// ── Typen ───────────────────────────────────────────────────────────────────

export type WerkstattSettingsProps = {
  name: string | null
  ansprechpartner_name: string | null
  adresse_strasse: string | null
  adresse_plz: string | null
  adresse_ort: string | null
  telefon: string | null
  email: string | null
  website: string | null
  ust_id: string | null
  ist_kleinunternehmer: boolean | null
  bank_iban: string | null
  bank_bic: string | null
  bank_kontoinhaber: string | null
}

type SaveState = {
  status: 'idle' | 'saving' | 'success' | 'error'
  msg?: string
}

// ── Haupt-Komponente ─────────────────────────────────────────────────────────

export function WerkstattSettings(props: WerkstattSettingsProps) {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-claimondo-navy">
          Einstellungen
        </h1>
        <p className="text-sm text-claimondo-ondo mt-0.5">
          Profil, Bankdaten und Sicherheit.
        </p>
      </header>

      <ProfilCard {...props} />
      <BankCard {...props} />
      <PasswortCard />
      <LogoutCard />
    </div>
  )
}

// ── Section-Wrapper ──────────────────────────────────────────────────────────

function SettingsSectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <SharedSectionCard
      size="lg"
      title={title}
      subtitle={subtitle}
      icon={
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ios-md border border-claimondo-border bg-claimondo-bg text-claimondo-ondo">
          {icon}
        </span>
      }
    >
      {children}
    </SharedSectionCard>
  )
}

// ── Feedback (kein raw button/card -> ratchet-neutral) ───────────────────────

function SaveFeedback({ state }: { state: SaveState }) {
  if (state.status === 'success') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-success-strong bg-success-soft border border-success/30 rounded-ios-lg px-2.5 py-1">
        <CheckCircle2Icon width={12} height={12} />
        Gespeichert
      </span>
    )
  }
  if (state.status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-danger-strong bg-danger-soft border border-danger/30 rounded-ios-lg px-2.5 py-1">
        <AlertTriangleIcon width={12} height={12} />
        {state.msg ?? 'Fehler'}
      </span>
    )
  }
  return null
}

// Label mit optionalem Pflicht-Sternchen (TextField nimmt ReactNode als label).
function fieldLabel(text: string, required = false) {
  return (
    <>
      {text}
      {required ? ' *' : ''}
    </>
  )
}

// ── 1. Profil ────────────────────────────────────────────────────────────────

function ProfilCard(props: WerkstattSettingsProps) {
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setState({ status: 'saving' })
    startTransition(async () => {
      const res = await updateWerkstattProfil({
        name: String(fd.get('name') ?? ''),
        ansprechpartner_name: String(fd.get('ansprechpartner_name') ?? ''),
        adresse_strasse: String(fd.get('adresse_strasse') ?? ''),
        adresse_plz: String(fd.get('adresse_plz') ?? ''),
        adresse_ort: String(fd.get('adresse_ort') ?? ''),
        telefon: String(fd.get('telefon') ?? ''),
        email: String(fd.get('email') ?? ''),
        website: String(fd.get('website') ?? ''),
        ust_id: String(fd.get('ust_id') ?? ''),
        ist_kleinunternehmer: fd.get('ist_kleinunternehmer') === 'true',
      })
      if (res.ok) {
        setState({ status: 'success' })
        setTimeout(() => setState({ status: 'idle' }), 2500)
      } else {
        setState({ status: 'error', msg: res.error })
      }
    })
  }

  return (
    <SettingsSectionCard
      icon={<UserIcon width={16} height={16} />}
      title="Profil"
      subtitle="Firmen- und Kontaktdaten."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <TextField
          label={fieldLabel('Firmenname', true)}
          name="name"
          defaultValue={props.name ?? ''}
          required
        />
        <TextField
          label={fieldLabel('Ansprechpartner', true)}
          name="ansprechpartner_name"
          defaultValue={props.ansprechpartner_name ?? ''}
          required
        />
        <TextField
          label="E-Mail"
          name="email"
          type="email"
          defaultValue={props.email ?? ''}
          placeholder="info@werkstatt.de"
        />
        <TextField
          label="Telefon"
          name="telefon"
          defaultValue={props.telefon ?? ''}
          placeholder="+49 30 1234567"
        />
        <TextField
          label="Website"
          name="website"
          defaultValue={props.website ?? ''}
          placeholder="https://www.meine-werkstatt.de"
        />
        <TextField
          label="USt-IdNr."
          name="ust_id"
          defaultValue={props.ust_id ?? ''}
          placeholder="DE123456789"
        />
        <TextField
          label="Straße & Hausnummer"
          name="adresse_strasse"
          defaultValue={props.adresse_strasse ?? ''}
        />
        <div className="grid grid-cols-3 gap-3">
          <TextField
            label="PLZ"
            name="adresse_plz"
            defaultValue={props.adresse_plz ?? ''}
          />
          <div className="col-span-2">
            <TextField
              label="Ort"
              name="adresse_ort"
              defaultValue={props.adresse_ort ?? ''}
            />
          </div>
        </div>

        {/* Kleinunternehmer-Toggle (Checkbox -> ratchet-neutral) */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="ist_kleinunternehmer"
            value="true"
            defaultChecked={props.ist_kleinunternehmer ?? false}
            className="mt-0.5 h-4 w-4 rounded border-claimondo-border text-claimondo-navy focus:ring-claimondo-ondo/40"
          />
          <span className="text-sm text-claimondo-navy leading-snug">
            Kleinunternehmer (§ 19 UStG) — Abrechnungen ohne MwSt.
          </span>
        </label>

        <div className="flex items-center gap-2 pt-2">
          <Button variant="navy" type="submit" loading={isPending}>
            Speichern
          </Button>
          <SaveFeedback state={state} />
        </div>
      </form>
    </SettingsSectionCard>
  )
}

// ── 2. Bankdaten ─────────────────────────────────────────────────────────────

function BankCard(props: WerkstattSettingsProps) {
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [ibanTouched, setIbanTouched] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setState({ status: 'saving' })
    startTransition(async () => {
      const res = await updateWerkstattBank({
        bank_iban: String(fd.get('bank_iban') ?? ''),
        bank_bic: String(fd.get('bank_bic') ?? ''),
        bank_kontoinhaber: String(fd.get('bank_kontoinhaber') ?? ''),
      })
      if (res.ok) {
        setState({ status: 'success' })
        setTimeout(() => setState({ status: 'idle' }), 2500)
      } else {
        setState({ status: 'error', msg: res.error })
      }
    })
  }

  return (
    <SettingsSectionCard
      icon={<LandmarkIcon width={16} height={16} />}
      title="Bankdaten"
      subtitle="Für die Auszahlung Ihrer Provisionen per SEPA."
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-3"
        onInput={(e) => {
          const t = e.target as HTMLInputElement
          if (t?.name === 'bank_iban') setIbanTouched(true)
        }}
      >
        <TextField
          label={fieldLabel('IBAN', true)}
          name="bank_iban"
          defaultValue={props.bank_iban ?? ''}
          required
          placeholder="DE89 3704 0044 0532 0130 00"
        />
        {ibanTouched ? (
          <p className="text-xs text-warning-strong bg-warning-soft border border-warning/30 rounded-ios-lg px-3 py-2 inline-flex items-start gap-2">
            <AlertTriangleIcon width={12} height={12} className="mt-0.5 shrink-0" />
            Die neue IBAN wird für alle ausstehenden Auszahlungen verwendet.
          </p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="BIC"
            name="bank_bic"
            defaultValue={props.bank_bic ?? ''}
            placeholder="COBADEFFXXX"
          />
          <TextField
            label={fieldLabel('Kontoinhaber', true)}
            name="bank_kontoinhaber"
            defaultValue={props.bank_kontoinhaber ?? ''}
            required
          />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Button variant="navy" type="submit" loading={isPending}>
            Speichern
          </Button>
          <SaveFeedback state={state} />
        </div>
      </form>
    </SettingsSectionCard>
  )
}

// ── 3. Passwort ───────────────────────────────────────────────────────────────

function PasswortCard() {
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setState({ status: 'saving' })
    startTransition(async () => {
      const res = await changeWerkstattPasswort({
        current: String(fd.get('current') ?? ''),
        next: String(fd.get('next') ?? ''),
        confirm: String(fd.get('confirm') ?? ''),
      })
      if (res.ok) {
        setState({ status: 'success' })
        form.reset()
        setTimeout(() => setState({ status: 'idle' }), 2500)
      } else {
        setState({ status: 'error', msg: res.error })
      }
    })
  }

  return (
    <SettingsSectionCard
      icon={<KeyRoundIcon width={16} height={16} />}
      title="Passwort ändern"
      subtitle="Mindestens 8 Zeichen, eine Ziffer und ein Buchstabe."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <TextField
          label={fieldLabel('Aktuelles Passwort', true)}
          name="current"
          type="password"
          required
          autoComplete="current-password"
        />
        <TextField
          label={fieldLabel('Neues Passwort', true)}
          name="next"
          type="password"
          required
          autoComplete="new-password"
        />
        <TextField
          label={fieldLabel('Neues Passwort bestätigen', true)}
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
        />
        <div className="flex items-center gap-2 pt-2">
          <Button
            variant="navy"
            type="submit"
            loading={isPending}
            iconLeft={<KeyRoundIcon width={14} height={14} />}
          >
            Passwort ändern
          </Button>
          <SaveFeedback state={state} />
        </div>
      </form>
    </SettingsSectionCard>
  )
}

// ── Abmelden ─────────────────────────────────────────────────────────────────

function LogoutCard() {
  return (
    <SettingsSectionCard
      icon={<LogOutIcon width={16} height={16} />}
      title="Abmelden"
      subtitle="Session auf diesem Gerät beenden."
    >
      <form action="/api/auth/logout" method="POST">
        <Button variant="ghost" type="submit" iconLeft={<LogOutIcon width={14} height={14} />}>
          Jetzt abmelden
        </Button>
      </form>
    </SettingsSectionCard>
  )
}

// ── Account-Löschung ──────────────────────────────────────────────────────────

// AccountLoeschenCard (mailto) entfernt — Werkstatt nutzt jetzt den strukturierten
// Self-Service-Loeschflow (DsgvoLoeschSection auf der Einstellungen-Page, wie Kunde/Makler/SV).
