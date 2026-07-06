'use client'

// Einstellungen-Client fuer Werkstatt-Partner: Profil / Bankdaten / Passwort.
// Gespiegelt nach MaklerSettings.tsx — gleiche Section-Wrapper, gleiche
// SaveButton/SaveFeedback-Muster, gleiche Input-Komponente.

import { useState, useTransition } from 'react'
import {
  UserIcon,
  LandmarkIcon,
  KeyRoundIcon,
  LogOutIcon,
  Trash2Icon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  SaveIcon,
} from 'lucide-react'
import {
  updateWerkstattProfil,
  updateWerkstattBank,
  changeWerkstattPasswort,
} from '@/lib/actions/werkstatt-settings'
import { SectionCard as SharedSectionCard } from '@/components/shared/SectionCard'

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
      <AccountLoeschenCard name={props.name} email={props.email} />
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

// ── Wiederverwendbare Sub-Komponenten ────────────────────────────────────────

function SaveButton({ state }: { state: SaveState }) {
  return (
    <button
      type="submit"
      disabled={state.status === 'saving'}
      className="inline-flex items-center gap-2 px-4 h-10 rounded-ios-lg bg-claimondo-navy text-white text-sm font-semibold hover:bg-claimondo-shield disabled:opacity-50"
    >
      {state.status === 'saving' ? (
        <Loader2Icon width={14} height={14} className="animate-spin" />
      ) : (
        <SaveIcon width={14} height={14} />
      )}
      Speichern
    </button>
  )
}

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

function Input({
  label,
  name,
  defaultValue,
  type = 'text',
  readOnly = false,
  placeholder,
  required = false,
  autoComplete,
}: {
  label: string
  name: string
  defaultValue?: string | null
  type?: string
  readOnly?: boolean
  placeholder?: string
  required?: boolean
  autoComplete?: string
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-claimondo-ondo font-medium">
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        readOnly={readOnly}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className={`mt-1 w-full rounded-ios-lg border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy placeholder:text-claimondo-shield focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40 ${
          readOnly ? 'bg-claimondo-bg text-claimondo-ondo cursor-not-allowed' : ''
        }`}
      />
    </label>
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
        <Input
          label="Firmenname"
          name="name"
          defaultValue={props.name}
          required
        />
        <Input
          label="Ansprechpartner"
          name="ansprechpartner_name"
          defaultValue={props.ansprechpartner_name}
          required
        />
        <Input
          label="E-Mail"
          name="email"
          defaultValue={props.email}
          type="email"
          placeholder="info@werkstatt.de"
        />
        <Input
          label="Telefon"
          name="telefon"
          defaultValue={props.telefon}
          placeholder="+49 30 1234567"
        />
        <Input
          label="Website"
          name="website"
          defaultValue={props.website}
          placeholder="https://www.meine-werkstatt.de"
        />
        <Input
          label="USt-IdNr."
          name="ust_id"
          defaultValue={props.ust_id}
          placeholder="DE123456789"
        />
        <Input
          label="Straße & Hausnummer"
          name="adresse_strasse"
          defaultValue={props.adresse_strasse}
        />
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="PLZ"
            name="adresse_plz"
            defaultValue={props.adresse_plz}
          />
          <div className="col-span-2">
            <Input
              label="Ort"
              name="adresse_ort"
              defaultValue={props.adresse_ort}
            />
          </div>
        </div>

        {/* Kleinunternehmer-Toggle */}
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
          <SaveButton state={{ status: isPending ? 'saving' : state.status }} />
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
        <Input
          label="IBAN"
          name="bank_iban"
          defaultValue={props.bank_iban}
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
          <Input
            label="BIC"
            name="bank_bic"
            defaultValue={props.bank_bic}
            placeholder="COBADEFFXXX"
          />
          <Input
            label="Kontoinhaber"
            name="bank_kontoinhaber"
            defaultValue={props.bank_kontoinhaber}
            required
          />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <SaveButton state={{ status: isPending ? 'saving' : state.status }} />
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
        <Input
          label="Aktuelles Passwort"
          name="current"
          type="password"
          required
          autoComplete="current-password"
        />
        <Input
          label="Neues Passwort"
          name="next"
          type="password"
          required
          autoComplete="new-password"
        />
        <Input
          label="Neues Passwort bestätigen"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
        />
        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-ios-lg bg-claimondo-navy text-white text-sm font-semibold hover:bg-claimondo-shield disabled:opacity-50"
          >
            {isPending ? (
              <Loader2Icon width={14} height={14} className="animate-spin" />
            ) : (
              <KeyRoundIcon width={14} height={14} />
            )}
            Passwort ändern
          </button>
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
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-4 h-10 rounded-ios-lg bg-white border border-claimondo-border text-sm font-semibold text-claimondo-navy hover:border-claimondo-ondo"
        >
          <LogOutIcon width={14} height={14} />
          Jetzt abmelden
        </button>
      </form>
    </SettingsSectionCard>
  )
}

// ── Account-Löschung ──────────────────────────────────────────────────────────

function AccountLoeschenCard({
  name,
  email,
}: {
  name: string | null
  email: string | null
}) {
  const subject = encodeURIComponent(
    `Account-Löschung anfragen: ${name ?? 'Werkstatt'}`,
  )
  const body = encodeURIComponent(
    `Hallo Claimondo-Team,\n\nich möchte meinen Werkstatt-Account löschen lassen.\n\nFirma: ${name ?? '-'}\nE-Mail: ${email ?? '-'}\n\nBitte bestätigen Sie den DSGVO-Löschauftrag.\n\nViele Grüße`,
  )
  return (
    <section className="bg-white rounded-ios-md border border-danger/30 overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-danger/20 bg-danger-soft/50">
        <span className="shrink-0 w-9 h-9 rounded-ios-xl bg-danger/15 text-danger-strong border border-danger/30 flex items-center justify-center">
          <Trash2Icon width={16} height={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-danger-strong">
            Account löschen
          </h2>
          <p className="text-xs text-danger-strong mt-0.5">
            DSGVO-konforme Löschung auf Anfrage — irreversibel.
          </p>
        </div>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-sm text-claimondo-navy">
          Die Account-Löschung wird manuell durch unser Team durchgeführt,
          damit alle DSGVO-Aufbewahrungs-Fristen beachtet werden können.
          Klicken Sie unten um per E-Mail anzufragen.
        </p>
        <a
          href={`mailto:info@claimondo.de?subject=${subject}&body=${body}`}
          className="inline-flex items-center gap-2 px-4 h-10 rounded-ios-lg bg-danger text-white text-sm font-semibold hover:bg-danger/90"
        >
          <Trash2Icon width={14} height={14} />
          Account-Löschung anfragen
        </a>
      </div>
    </section>
  )
}
