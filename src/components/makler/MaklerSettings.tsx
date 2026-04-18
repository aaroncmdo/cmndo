'use client'

// AAR-492 (M10): Einstellungen-Client mit 7 Card-Sections. Jede Section
// hat ihren eigenen Save-Button + lokalen Loading-/Error-/Success-State.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  UserIcon,
  LandmarkIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
  BellIcon,
  LogOutIcon,
  Trash2Icon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  SaveIcon,
  XIcon,
} from 'lucide-react'
import type {
  MaklerFullProfile,
  AktiveConsentRow,
  NotificationPreferences,
} from '@/lib/makler/queries'
import {
  updateMaklerProfil,
  updateMaklerBank,
  changeMaklerPasswort,
  revokeMaklerConsent,
  updateMaklerNotificationPrefs,
} from '@/lib/actions/makler-settings'

const DATE_SHORT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  return DATE_SHORT.format(new Date(iso))
}

type SaveState = {
  status: 'idle' | 'saving' | 'success' | 'error'
  msg?: string
}

export function MaklerSettings({
  profile,
  consents,
}: {
  profile: MaklerFullProfile
  consents: AktiveConsentRow[]
}) {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-[#0D1B3E]">
          Einstellungen
        </h1>
        <p className="text-sm text-[#4573A2] mt-0.5">
          Profil, Bank, Sicherheit und Benachrichtigungen.
        </p>
      </header>

      <ProfilCard profile={profile} />
      <BankCard profile={profile} />
      <PasswortCard />
      <ConsentsCard consents={consents} />
      <NotificationsCard prefs={profile.notification_preferences} />
      <LogoutCard />
      <AccountLoeschenCard firma={profile.firma} email={profile.email} />
    </div>
  )
}

// ── Section wrapper ─────────────────────────────────────────────────────────

function SectionCard({
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
    <section className="bg-white rounded-2xl border border-[#e4e7ef] overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-[#e4e7ef]">
        <span className="shrink-0 w-9 h-9 rounded-xl bg-[#f8f9fb] text-[#4573A2] border border-[#e4e7ef] flex items-center justify-center">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[#0D1B3E]">{title}</h2>
          {subtitle ? (
            <p className="text-xs text-[#4573A2] mt-0.5">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function SaveButton({ state }: { state: SaveState }) {
  return (
    <button
      type="submit"
      disabled={state.status === 'saving'}
      className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[#0D1B3E] text-white text-sm font-semibold hover:bg-[#1E3A5F] disabled:opacity-50"
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
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
        <CheckCircle2Icon width={12} height={12} />
        Gespeichert
      </span>
    )
  }
  if (state.status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
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
  pattern,
  autoComplete,
}: {
  label: string
  name: string
  defaultValue?: string | null
  type?: string
  readOnly?: boolean
  placeholder?: string
  required?: boolean
  pattern?: string
  autoComplete?: string
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-[#4573A2] font-medium">
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
        pattern={pattern}
        autoComplete={autoComplete}
        className={`mt-1 w-full rounded-lg border border-[#e4e7ef] bg-white px-3 py-2 text-sm text-[#0D1B3E] placeholder:text-[#7BA3CC] focus:outline-none focus:ring-2 focus:ring-[#4573A2]/40 ${
          readOnly ? 'bg-[#f8f9fb] text-[#4573A2] cursor-not-allowed' : ''
        }`}
      />
    </label>
  )
}

// ── 1. Profil ───────────────────────────────────────────────────────────────

function ProfilCard({ profile }: { profile: MaklerFullProfile }) {
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setState({ status: 'saving' })
    startTransition(async () => {
      const res = await updateMaklerProfil({
        firma: String(fd.get('firma') ?? ''),
        ansprechpartner_vorname: String(fd.get('ansprechpartner_vorname') ?? ''),
        ansprechpartner_nachname: String(fd.get('ansprechpartner_nachname') ?? ''),
        ihk_nummer: String(fd.get('ihk_nummer') ?? ''),
        telefon: String(fd.get('telefon') ?? ''),
        adresse_strasse: String(fd.get('adresse_strasse') ?? ''),
        adresse_plz: String(fd.get('adresse_plz') ?? ''),
        adresse_ort: String(fd.get('adresse_ort') ?? ''),
      })
      if (res.success) {
        setState({ status: 'success' })
        setTimeout(() => setState({ status: 'idle' }), 2500)
      } else {
        setState({ status: 'error', msg: res.error })
      }
    })
  }

  return (
    <SectionCard
      icon={<UserIcon width={16} height={16} />}
      title="Profil"
      subtitle="Firmen- und Kontaktdaten."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Firma"
          name="firma"
          defaultValue={profile.firma}
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Vorname"
            name="ansprechpartner_vorname"
            defaultValue={profile.ansprechpartner_vorname}
            required
          />
          <Input
            label="Nachname"
            name="ansprechpartner_nachname"
            defaultValue={profile.ansprechpartner_nachname}
            required
          />
        </div>
        <Input
          label="IHK-Nummer"
          name="ihk_nummer"
          defaultValue={profile.ihk_nummer}
        />
        <Input
          label="Email"
          name="email"
          defaultValue={profile.email}
          readOnly
        />
        <Input
          label="Telefon"
          name="telefon"
          defaultValue={profile.telefon}
          placeholder="+49 30 1234567"
        />
        <Input
          label="Straße & Hausnummer"
          name="adresse_strasse"
          defaultValue={profile.adresse_strasse}
        />
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="PLZ"
            name="adresse_plz"
            defaultValue={profile.adresse_plz}
          />
          <div className="col-span-2">
            <Input
              label="Ort"
              name="adresse_ort"
              defaultValue={profile.adresse_ort}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <SaveButton state={{ status: isPending ? 'saving' : state.status }} />
          <SaveFeedback state={state} />
        </div>
      </form>
    </SectionCard>
  )
}

// ── 2. Bank ─────────────────────────────────────────────────────────────────

function BankCard({ profile }: { profile: MaklerFullProfile }) {
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [ibanTouched, setIbanTouched] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setState({ status: 'saving' })
    startTransition(async () => {
      const res = await updateMaklerBank({
        bank_iban: String(fd.get('bank_iban') ?? ''),
        bank_bic: String(fd.get('bank_bic') ?? ''),
        bank_kontoinhaber: String(fd.get('bank_kontoinhaber') ?? ''),
      })
      if (res.success) {
        setState({ status: 'success' })
        setTimeout(() => setState({ status: 'idle' }), 2500)
      } else {
        setState({ status: 'error', msg: res.error })
      }
    })
  }

  return (
    <SectionCard
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
          defaultValue={profile.bank_iban}
          required
          placeholder="DE89 3704 0044 0532 0130 00"
        />
        {ibanTouched ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-start gap-2">
            <AlertTriangleIcon width={12} height={12} className="mt-0.5 shrink-0" />
            Die neue IBAN wird für alle ausstehenden Auszahlungen verwendet.
          </p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="BIC"
            name="bank_bic"
            defaultValue={profile.bank_bic}
            placeholder="COBADEFFXXX"
          />
          <Input
            label="Kontoinhaber"
            name="bank_kontoinhaber"
            defaultValue={profile.bank_kontoinhaber}
            required
          />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <SaveButton state={{ status: isPending ? 'saving' : state.status }} />
          <SaveFeedback state={state} />
        </div>
      </form>
    </SectionCard>
  )
}

// ── 3. Passwort ─────────────────────────────────────────────────────────────

function PasswortCard() {
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setState({ status: 'saving' })
    startTransition(async () => {
      const res = await changeMaklerPasswort({
        current: String(fd.get('current') ?? ''),
        next: String(fd.get('next') ?? ''),
        confirm: String(fd.get('confirm') ?? ''),
      })
      if (res.success) {
        setState({ status: 'success' })
        form.reset()
        setTimeout(() => setState({ status: 'idle' }), 2500)
      } else {
        setState({ status: 'error', msg: res.error })
      }
    })
  }

  return (
    <SectionCard
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
            className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[#0D1B3E] text-white text-sm font-semibold hover:bg-[#1E3A5F] disabled:opacity-50"
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
    </SectionCard>
  )
}

// ── 4. Consents ─────────────────────────────────────────────────────────────

function ConsentsCard({ consents }: { consents: AktiveConsentRow[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function doRevoke(id: string) {
    setPendingId(id)
    setError(null)
    const res = await revokeMaklerConsent(id)
    setPendingId(null)
    setConfirmId(null)
    if (res.success) {
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  return (
    <SectionCard
      icon={<ShieldCheckIcon width={16} height={16} />}
      title="Aktive Kunden-Consents"
      subtitle="Übersicht aller Fälle mit aktivem Zugriff. Kunden können den Zugriff jederzeit selbst widerrufen."
    >
      <p className="text-xs text-[#4573A2] bg-[#f8f9fb] border border-[#e4e7ef] rounded-lg px-3 py-2 mb-3">
        Sie können Consents auch von sich aus beenden — z.&nbsp;B. nach
        Abschluss eines Falls zur Datensparsamkeit.
      </p>
      {consents.length === 0 ? (
        <p className="text-sm text-[#7BA3CC] text-center py-6">
          Keine aktiven Consents.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-[#4573A2]">
              <tr className="border-b border-[#e4e7ef]">
                <th className="text-left py-2 font-semibold">Kunde</th>
                <th className="text-left py-2 font-semibold">Fall</th>
                <th className="text-left py-2 font-semibold">Scope</th>
                <th className="text-left py-2 font-semibold">Seit</th>
                <th className="text-right py-2 font-semibold">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {consents.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[#e4e7ef] last:border-b-0"
                >
                  <td className="py-2.5 text-[#0D1B3E]">
                    {c.kunde_name ?? '–'}
                  </td>
                  <td className="py-2.5">
                    {c.fall_id ? (
                      <Link
                        href={`/makler/akten/${c.fall_id}`}
                        className="text-[#4573A2] hover:text-[#0D1B3E] font-medium"
                      >
                        {c.fall_nummer ?? '–'}
                      </Link>
                    ) : (
                      <span className="text-[#7BA3CC]">–</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${
                        c.consent_scope === 'vollzugriff'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-[#f8f9fb] text-[#4573A2] border border-[#e4e7ef]'
                      }`}
                    >
                      <ShieldCheckIcon width={10} height={10} />
                      {c.consent_scope === 'vollzugriff' ? 'Vollzugriff' : 'Minimal'}
                    </span>
                  </td>
                  <td className="py-2.5 text-[#0D1B3E] whitespace-nowrap">
                    {fmtDate(c.consent_gegeben_am)}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setConfirmId(c.id)}
                      disabled={pendingId === c.id}
                      className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
                    >
                      {pendingId === c.id ? (
                        <Loader2Icon width={12} height={12} className="animate-spin" />
                      ) : (
                        <XIcon width={12} height={12} />
                      )}
                      Widerrufen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error ? (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3 inline-flex items-start gap-2">
          <AlertTriangleIcon width={12} height={12} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {confirmId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center">
                <AlertTriangleIcon width={18} height={18} />
              </span>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[#0D1B3E]">
                  Consent wirklich widerrufen?
                </h3>
                <p className="text-sm text-[#4573A2] mt-1">
                  Dieser Consent wird sofort widerrufen und Sie verlieren den
                  Zugriff auf den Fall. Diese Aktion kann nicht rückgängig
                  gemacht werden.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="px-4 h-10 rounded-lg bg-white border border-[#e4e7ef] text-sm text-[#0D1B3E] hover:border-[#4573A2]"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => doRevoke(confirmId)}
                disabled={pendingId !== null}
                className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {pendingId ? (
                  <Loader2Icon width={14} height={14} className="animate-spin" />
                ) : (
                  <XIcon width={14} height={14} />
                )}
                Jetzt widerrufen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  )
}

// ── 5. Benachrichtigungen ──────────────────────────────────────────────────

const NOTIF_LABELS: Array<{ key: keyof NotificationPreferences; label: string; hint?: string }> = [
  { key: 'neuer_lead', label: 'Neuer Lead via Promo-Code' },
  { key: 'kanzlei_uebergabe', label: 'Fall erreicht Kanzlei-Übergabe' },
  { key: 'provision_freigegeben', label: 'Provision freigegeben' },
  { key: 'monats_abrechnung', label: 'Monatliche Abrechnungs-Zusammenfassung' },
  {
    key: 'woechentlicher_report',
    label: 'Wöchentlicher Report',
    hint: 'Optional, Opt-In',
  },
]

function NotificationsCard({ prefs }: { prefs: NotificationPreferences }) {
  const [local, setLocal] = useState<NotificationPreferences>(prefs)
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()

  function toggle(key: keyof NotificationPreferences) {
    setLocal((p) => ({ ...p, [key]: !p[key] }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState({ status: 'saving' })
    startTransition(async () => {
      const res = await updateMaklerNotificationPrefs(local)
      if (res.success) {
        setState({ status: 'success' })
        setTimeout(() => setState({ status: 'idle' }), 2500)
      } else {
        setState({ status: 'error', msg: res.error })
      }
    })
  }

  return (
    <SectionCard
      icon={<BellIcon width={16} height={16} />}
      title="Benachrichtigungen"
      subtitle="Welche Emails möchten Sie erhalten?"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          {NOTIF_LABELS.map((n) => (
            <label
              key={n.key}
              className="flex items-start gap-3 p-3 rounded-lg border border-[#e4e7ef] bg-[#f8f9fb] hover:bg-white cursor-pointer"
            >
              <input
                type="checkbox"
                checked={local[n.key]}
                onChange={() => toggle(n.key)}
                className="mt-0.5 w-4 h-4 rounded border-[#e4e7ef] text-[#0D1B3E] focus:ring-[#4573A2]/40"
              />
              <div className="flex-1">
                <p className="text-sm text-[#0D1B3E]">{n.label}</p>
                {n.hint ? (
                  <p className="text-xs text-[#7BA3CC]">{n.hint}</p>
                ) : null}
              </div>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-2">
          <SaveButton state={{ status: isPending ? 'saving' : state.status }} />
          <SaveFeedback state={state} />
        </div>
      </form>
    </SectionCard>
  )
}

// ── 6. Logout ───────────────────────────────────────────────────────────────

function LogoutCard() {
  return (
    <SectionCard
      icon={<LogOutIcon width={16} height={16} />}
      title="Abmelden"
      subtitle="Session auf diesem Gerät beenden."
    >
      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-white border border-[#e4e7ef] text-sm font-semibold text-[#0D1B3E] hover:border-[#4573A2]"
        >
          <LogOutIcon width={14} height={14} />
          Jetzt abmelden
        </button>
      </form>
    </SectionCard>
  )
}

// ── 7. Account-Löschung ─────────────────────────────────────────────────────

function AccountLoeschenCard({
  firma,
  email,
}: {
  firma: string | null
  email: string | null
}) {
  const subject = encodeURIComponent(
    `Account-Löschung anfragen: ${firma ?? 'Makler'}`,
  )
  const body = encodeURIComponent(
    `Hallo Claimondo-Team,\n\nich möchte meinen Makler-Account löschen lassen.\n\nFirma: ${firma ?? '-'}\nEmail: ${email ?? '-'}\n\nBitte bestätigen Sie den DSGVO-Löschauftrag.\n\nViele Grüße`,
  )
  return (
    <section className="bg-white rounded-2xl border border-red-200 overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-red-100 bg-red-50/50">
        <span className="shrink-0 w-9 h-9 rounded-xl bg-red-100 text-red-700 border border-red-200 flex items-center justify-center">
          <Trash2Icon width={16} height={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-red-900">
            Account löschen
          </h2>
          <p className="text-xs text-red-700 mt-0.5">
            DSGVO-konforme Löschung auf Anfrage — irreversibel.
          </p>
        </div>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-sm text-[#0D1B3E]">
          Die Account-Löschung wird manuell durch unser Team durchgeführt,
          damit alle DSGVO-Aufbewahrungs-Fristen (z.&nbsp;B. offene Fälle)
          beachtet werden können. Klicken Sie unten um per Email anzufragen.
        </p>
        <a
          href={`mailto:hallo@claimondo.de?subject=${subject}&body=${body}`}
          className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
        >
          <Trash2Icon width={14} height={14} />
          Account-Löschung anfragen
        </a>
      </div>
    </section>
  )
}
