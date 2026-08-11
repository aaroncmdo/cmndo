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
  WrenchIcon,
  TagIcon,
  CarIcon,
  PlusIcon,
} from 'lucide-react'
import {
  updateWerkstattProfil,
  updateWerkstattBank,
  changeWerkstattPasswort,
  setMeineFaehigkeiten,
  setMeineMarken,
  setMeineMarkenoffen,
  setMeineFahrzeugGruppen,
} from '@/lib/actions/werkstatt-settings'
import { GEWERKE } from '@/lib/werkstatt/bedarf/types'
import { HAEUFIGE_HERSTELLER } from '@/app/embed/werkstatt-finder/_components/wizard-logic'
import { FAHRZEUG_GRUPPEN } from '@/lib/werkstatt/fahrzeug-gruppen'
import { SectionCard as SharedSectionCard } from '@/components/shared/SectionCard'
import { TextField } from '@/components/shared/forms'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { Button } from '@/components/primitives/Button'

const MARKEN_INPUT_CLS =
  'flex-1 px-3 py-2 rounded-ios-md border border-claimondo-border bg-white text-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/20'

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
  faehigkeiten?: string[] | null
  marken?: string[] | null
  ist_freie_werkstatt?: boolean | null
  fahrzeug_gruppen?: string[] | null
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
      <LeistungenCard faehigkeiten={props.faehigkeiten ?? null} />
      <MarkenCard marken={props.marken ?? null} istFreieWerkstatt={props.ist_freie_werkstatt ?? null} />
      <FahrzeugGruppenCard fahrzeugGruppen={props.fahrzeug_gruppen ?? null} />
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
  // P2 Ortseingaben: Adresse controlled (GooglePlaceAutocomplete rendert kein name-Attribut) →
  // im Submit aus dem state statt fd.get. Autocomplete füllt strasse/plz/ort, Felder editierbar.
  const [adr, setAdr] = useState({
    strasse: props.adresse_strasse ?? '',
    plz: props.adresse_plz ?? '',
    ort: props.adresse_ort ?? '',
  })

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setState({ status: 'saving' })
    startTransition(async () => {
      const res = await updateWerkstattProfil({
        name: String(fd.get('name') ?? ''),
        ansprechpartner_name: String(fd.get('ansprechpartner_name') ?? ''),
        adresse_strasse: adr.strasse,
        adresse_plz: adr.plz,
        adresse_ort: adr.ort,
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
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-claimondo-shield">Straße &amp; Hausnummer</label>
          {/* P2 Ortseingaben: Autocomplete füllt Straße + PLZ + Ort (controlled state → Submit). */}
          <GooglePlaceAutocomplete
            className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
            defaultValue={adr.strasse}
            placeholder="Straße + Hausnummer eingeben…"
            onSelect={(r) =>
              setAdr((a) => ({ strasse: r.strasse || a.strasse, plz: r.plz || a.plz, ort: r.stadt || a.ort }))
            }
            onChange={(t) => setAdr((a) => ({ ...a, strasse: t }))}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextField
            label="PLZ"
            value={adr.plz}
            onChange={(e) => setAdr((a) => ({ ...a, plz: e.target.value }))}
          />
          <div className="col-span-2">
            <TextField
              label="Ort"
              value={adr.ort}
              onChange={(e) => setAdr((a) => ({ ...a, ort: e.target.value }))}
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

// ── 4. Meine Leistungen ───────────────────────────────────────────────────────

const GEWERK_LABELS: Record<string, string> = {
  karosserie: 'Karosserie',
  lackierung: 'Lackierung',
  mechanik: 'Mechanik',
  glas: 'Glas',
  smart_repair: 'Smart-Repair',
}

function LeistungenCard({ faehigkeiten }: { faehigkeiten: string[] | null }) {
  const [sel, setSel] = useState<string[]>(faehigkeiten ?? [])
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()

  function toggleGewerk(v: string) {
    setSel((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
  }

  function handleSave() {
    setState({ status: 'saving' })
    startTransition(async () => {
      const res = await setMeineFaehigkeiten(sel)
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
      icon={<WrenchIcon width={16} height={16} />}
      title="Meine Leistungen"
      subtitle="Welche Schadensarten führen Sie durch?"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(GEWERKE as readonly string[]).map((g) => (
            <Button
              key={g}
              variant={sel.includes(g) ? 'navy' : 'ghost'}
              size="sm"
              onClick={() => toggleGewerk(g)}
              type="button"
            >
              {GEWERK_LABELS[g] ?? g}
            </Button>
          ))}
        </div>
        <p className="text-xs text-claimondo-ondo">
          Nichts gewählt = Vollservice (keine Einschränkung).
        </p>
        <div className="flex items-center gap-2 pt-1">
          <Button variant="navy" size="sm" loading={isPending} onClick={handleSave} type="button">
            Speichern
          </Button>
          <SaveFeedback state={state} />
        </div>
      </div>
    </SettingsSectionCard>
  )
}

// ── 5. Meine Marken ───────────────────────────────────────────────────────────

function MarkenCard({
  marken,
  istFreieWerkstatt,
}: {
  marken: string[] | null
  /** D2: ist_freie_werkstatt-Override (null = nie gepflegt -> Matching leitet aus Marken ab). */
  istFreieWerkstatt: boolean | null
}) {
  const [sel, setSel] = useState<string[]>(marken ?? [])
  const [input, setInput] = useState('')
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()
  const [markenoffen, setMarkenoffen] = useState<boolean>(istFreieWerkstatt === true)
  const [markenoffenBusy, setMarkenoffenBusy] = useState(false)
  const [markenoffenFehler, setMarkenoffenFehler] = useState<string | null>(null)

  async function toggleMarkenoffen() {
    const next = !markenoffen
    setMarkenoffenFehler(null)
    setMarkenoffenBusy(true)
    try {
      const res = await setMeineMarkenoffen(next)
      if (!res.ok) {
        setMarkenoffenFehler(res.error ?? 'Fehler beim Speichern')
        return
      }
      setMarkenoffen(next)
    } finally {
      setMarkenoffenBusy(false)
    }
  }

  const hat = (m: string) => sel.some((x) => x.toLowerCase() === m.toLowerCase())
  function toggle(m: string) {
    setSel((prev) => (hat(m) ? prev.filter((x) => x.toLowerCase() !== m.toLowerCase()) : [...prev, m]))
  }
  function addCustom() {
    const m = input.trim()
    if (m && !hat(m)) setSel((prev) => [...prev, m])
    setInput('')
  }
  function handleSave() {
    setState({ status: 'saving' })
    startTransition(async () => {
      const res = await setMeineMarken(sel)
      if (res.ok) {
        setState({ status: 'success' })
        setTimeout(() => setState({ status: 'idle' }), 2500)
      } else {
        setState({ status: 'error', msg: res.error })
      }
    })
  }

  // Custom-Marken (nicht in der Häufig-Liste) zuerst zeigen, dann die Häufig-Liste —
  // so bleiben eigene Brands sichtbar + abwählbar, ohne separaten Entfernen-Button.
  const customSel = sel.filter((m) => !HAEUFIGE_HERSTELLER.some((h) => h.toLowerCase() === m.toLowerCase()))
  const chips = [...customSel, ...HAEUFIGE_HERSTELLER]

  return (
    <SettingsSectionCard
      icon={<TagIcon width={16} height={16} />}
      title="Meine Marken"
      subtitle="Welche Fahrzeug-Marken reparieren Sie? Stärkt Ihre Platzierung im Finder."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {chips.map((m) => (
            <Button
              key={m}
              variant={hat(m) ? 'navy' : 'ghost'}
              size="sm"
              onClick={() => toggle(m)}
              type="button"
            >
              {m}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
            }}
            placeholder="Weitere Marke hinzufügen…"
            className={MARKEN_INPUT_CLS}
          />
          <Button variant="ghost" size="sm" onClick={addCustom} type="button">
            <PlusIcon width={16} height={16} />
          </Button>
        </div>
        <p className="text-xs text-claimondo-ondo">Nichts gewählt = markenoffen (alle Marken).</p>

        {/* D2: markenoffen-Override — speichert sofort (eigene Action, unabhaengig vom Marken-Save) */}
        <label className="flex items-start gap-3 text-sm text-claimondo-navy">
          <input
            type="checkbox"
            checked={markenoffen}
            onChange={toggleMarkenoffen}
            disabled={markenoffenBusy}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-claimondo-border"
          />
          <span>
            Wir nehmen alle Marken an (markenoffen)
            <span className="block text-xs text-claimondo-shield/70">
              Auch mit gepflegten Marken können Sie markenoffen bleiben — reine Spezialisten
              schalten das aus. Der Vertragswerkstatt-Rang für gepflegte Marken gilt erst nach
              Verifizierung durch Claimondo.
            </span>
            {istFreieWerkstatt == null && sel.length === 0 && (
              <span className="block text-xs text-claimondo-ondo">
                markenoffen (abgeleitet — keine Marken gepflegt)
              </span>
            )}
          </span>
        </label>
        {markenoffenFehler && <p className="text-xs text-danger-strong">{markenoffenFehler}</p>}

        <div className="flex items-center gap-2 pt-1">
          <Button variant="navy" size="sm" loading={isPending} onClick={handleSave} type="button">
            Speichern
          </Button>
          <SaveFeedback state={state} />
        </div>
      </div>
    </SettingsSectionCard>
  )
}

// ── 6. Fahrzeug-Gruppen ───────────────────────────────────────────────────────

function FahrzeugGruppenCard({ fahrzeugGruppen }: { fahrzeugGruppen: string[] | null }) {
  const [sel, setSel] = useState<string[]>(fahrzeugGruppen ?? [])
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()

  function toggle(g: string) {
    setSel((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
  }
  function handleSave() {
    setState({ status: 'saving' })
    startTransition(async () => {
      const res = await setMeineFahrzeugGruppen(sel)
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
      icon={<CarIcon width={16} height={16} />}
      title="Fahrzeug-Gruppen"
      subtitle="Welche Fahrzeugklassen bedienen Sie?"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FAHRZEUG_GRUPPEN.map((g) => (
            <Button
              key={g.value}
              variant={sel.includes(g.value) ? 'navy' : 'ghost'}
              size="sm"
              onClick={() => toggle(g.value)}
              type="button"
            >
              {g.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-claimondo-ondo">Nichts gewählt = keine Einschränkung.</p>
        <div className="flex items-center gap-2 pt-1">
          <Button variant="navy" size="sm" loading={isPending} onClick={handleSave} type="button">
            Speichern
          </Button>
          <SaveFeedback state={state} />
        </div>
      </div>
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
