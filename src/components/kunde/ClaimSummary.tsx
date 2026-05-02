'use client'

// CMM-32 Polish: Read-only Übersicht des Falls für den Kunden.
// Tabs:
//   1. Fahrzeug      — Marke/Modell/Baujahr/Aufbau, Kennzeichenhalter oben
//   2. Unfall        — Datum, Ort, Beschreibung, Schadenstyp
//   3. Beteiligte    — Halter (falls != Kunde), eigene VS, gegnerische VS
// Komplett read-only — Editing läuft über das Onboarding/KB-Portal.

import { useState } from 'react'
import {
  CarIcon,
  AlertOctagonIcon,
  UsersIcon,
  CalendarIcon,
  MapPinIcon,
  GaugeIcon,
  FuelIcon,
  ShieldIcon,
  HashIcon,
  PhoneIcon,
  MailIcon,
  InfoIcon,
} from 'lucide-react'
import Kennzeichenhalter from './Kennzeichenhalter'

type FallSummary = {
  // Fahrzeug
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  erstzulassung: string | null
  kilometerstand: number | null
  fahrzeug_aufbau: string | null
  kraftstoff: string | null
  fahrgestellnummer: string | null
  // Unfall
  schadens_datum: string | null
  schadens_ort: string | null
  schadens_plz: string | null
  schadens_beschreibung: string | null
  schadenart: string | null
  // Beteiligte
  halter_vorname: string | null
  halter_nachname: string | null
  halter_ist_kunde: boolean | null
  vs_eigener_name: string | null
  vs_gegner_name: string | null
  vs_gegner_schaden_nr: string | null
  vs_gegner_telefon: string | null
  vs_gegner_email: string | null
  // Kontakt-Kunde (falls als Halter zu zeigen)
  kunde_vorname: string | null
  kunde_nachname: string | null
}

const TABS = [
  { key: 'fahrzeug', label: 'Fahrzeug', icon: CarIcon },
  { key: 'unfall', label: 'Unfall', icon: AlertOctagonIcon },
  { key: 'beteiligte', label: 'Beteiligte', icon: UsersIcon },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function ClaimSummary({ data }: { data: FallSummary }) {
  const [activeTab, setActiveTab] = useState<TabKey>('fahrzeug')

  return (
    <section className="rounded-2xl border border-claimondo-border bg-white shadow-sm overflow-hidden">
      {/* Kennzeichenhalter-Header */}
      <header className="bg-gradient-to-br from-[#0D1B3E] to-[#1f2e54] px-5 py-5 sm:py-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <Kennzeichenhalter kennzeichen={data.kennzeichen} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-[#7BA3CC] font-semibold">
            Zusammenfassung
          </p>
          <p className="text-lg sm:text-xl font-bold text-white leading-tight mt-0.5 truncate">
            {[data.fahrzeug_hersteller, data.fahrzeug_modell].filter(Boolean).join(' ')
              || 'Dein Fahrzeug'}
          </p>
          {data.erstzulassung && (
            <p className="text-xs text-[#7BA3CC] mt-0.5">
              Erstzulassung {formatDate(data.erstzulassung)}
            </p>
          )}
        </div>
      </header>

      {/* Tab-Leiste */}
      <div className="flex border-b border-claimondo-border bg-[#f8f9fb]">
        {TABS.map((tab) => {
          const TabIcon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs sm:text-sm font-medium transition-colors ${
                active
                  ? 'text-claimondo-navy border-b-2 border-claimondo-navy bg-white'
                  : 'text-claimondo-ondo hover:text-claimondo-navy hover:bg-white/60'
              }`}
            >
              <TabIcon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab-Inhalt */}
      <div className="p-5 sm:p-6">
        {activeTab === 'fahrzeug' && <FahrzeugTab data={data} />}
        {activeTab === 'unfall' && <UnfallTab data={data} />}
        {activeTab === 'beteiligte' && <BeteiligteTab data={data} />}
      </div>
    </section>
  )
}

// ─── Fahrzeug ─────────────────────────────────────────────────────────────

function FahrzeugTab({ data }: { data: FallSummary }) {
  const fahrgestellMasked = data.fahrgestellnummer
    ? `••• •••• ${data.fahrgestellnummer.slice(-4)}`
    : null
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
      <Field
        icon={CarIcon}
        label="Hersteller"
        value={data.fahrzeug_hersteller}
      />
      <Field
        icon={CarIcon}
        label="Modell"
        value={data.fahrzeug_modell}
      />
      <Field
        icon={CalendarIcon}
        label="Erstzulassung"
        value={data.erstzulassung ? formatDate(data.erstzulassung) : null}
      />
      <Field
        icon={GaugeIcon}
        label="Kilometerstand"
        value={data.kilometerstand != null ? `${data.kilometerstand.toLocaleString('de-DE')} km` : null}
      />
      <Field
        icon={CarIcon}
        label="Aufbau"
        value={data.fahrzeug_aufbau ? aufbauLabel(data.fahrzeug_aufbau) : null}
      />
      <Field
        icon={FuelIcon}
        label="Antrieb"
        value={data.kraftstoff ? kraftstoffLabel(data.kraftstoff) : null}
      />
      <Field
        icon={HashIcon}
        label="Fahrgestellnummer"
        value={fahrgestellMasked}
        valueClassName="font-mono"
      />
    </dl>
  )
}

// ─── Unfall ───────────────────────────────────────────────────────────────

function UnfallTab({ data }: { data: FallSummary }) {
  const ort = [data.schadens_plz, data.schadens_ort].filter(Boolean).join(' ') || null
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <Field
          icon={CalendarIcon}
          label="Schadensdatum"
          value={data.schadens_datum ? formatDate(data.schadens_datum) : null}
        />
        <Field
          icon={MapPinIcon}
          label="Ort"
          value={ort}
        />
        <Field
          icon={ShieldIcon}
          label="Schadensart"
          value={data.schadenart ? schadenartLabel(data.schadenart) : null}
        />
      </dl>
      {data.schadens_beschreibung && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-1.5">
            Unfallhergang
          </p>
          <p className="text-sm text-claimondo-navy leading-relaxed whitespace-pre-wrap rounded-lg bg-[#f8f9fb] border border-claimondo-border p-3">
            {data.schadens_beschreibung}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Beteiligte ───────────────────────────────────────────────────────────

function BeteiligteTab({ data }: { data: FallSummary }) {
  const halterName =
    data.halter_ist_kunde
      ? [data.kunde_vorname, data.kunde_nachname].filter(Boolean).join(' ') || null
      : [data.halter_vorname, data.halter_nachname].filter(Boolean).join(' ') || null
  return (
    <div className="space-y-5">
      {/* Halter */}
      <PartyCard
        title="Halter"
        rows={[
          { label: 'Name', value: halterName },
          ...(data.halter_ist_kunde === false ? [{ label: 'Hinweis', value: 'Halter ist nicht der Geschädigte (du)' }] : []),
        ]}
      />

      {/* Eigene Versicherung */}
      {data.vs_eigener_name && (
        <PartyCard
          title="Deine Versicherung"
          rows={[{ label: 'Versicherer', value: data.vs_eigener_name }]}
        />
      )}

      {/* Gegnerische Versicherung */}
      <PartyCard
        title="Gegnerische Versicherung"
        rows={[
          { label: 'Versicherer', value: data.vs_gegner_name },
          { label: 'Schadennummer', value: data.vs_gegner_schaden_nr, mono: true },
          { label: 'Telefon', value: data.vs_gegner_telefon, icon: PhoneIcon },
          { label: 'E-Mail', value: data.vs_gegner_email, icon: MailIcon, mono: true },
        ]}
      />
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function Field({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: typeof CarIcon
  label: string
  value: string | null
  valueClassName?: string
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-claimondo-ondo/70 shrink-0 mt-1" />
      <div className="flex-1 min-w-0">
        <dt className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold">
          {label}
        </dt>
        <dd
          className={`text-sm text-claimondo-navy mt-0.5 ${valueClassName ?? ''} ${
            value == null ? 'text-claimondo-ondo/40 italic' : ''
          }`}
        >
          {value ?? 'nicht angegeben'}
        </dd>
      </div>
    </div>
  )
}

function PartyCard({
  title,
  rows,
}: {
  title: string
  rows: Array<{
    label: string
    value: string | null
    mono?: boolean
    icon?: typeof CarIcon
  }>
}) {
  const hasAny = rows.some((r) => r.value)
  return (
    <div className="rounded-xl border border-claimondo-border bg-[#f8f9fb] p-4">
      <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-2.5">
        {title}
      </p>
      {!hasAny ? (
        <p className="text-xs text-claimondo-ondo/60 flex items-center gap-1.5">
          <InfoIcon className="w-3 h-3" /> Noch keine Angaben
        </p>
      ) : (
        <dl className="space-y-1.5">
          {rows.map((r) => {
            if (!r.value) return null
            const RIcon = r.icon
            return (
              <div key={r.label} className="flex items-baseline gap-3 text-xs">
                <dt className="w-32 shrink-0 text-claimondo-ondo/80 flex items-center gap-1">
                  {RIcon && <RIcon className="w-3 h-3" />}
                  {r.label}
                </dt>
                <dd
                  className={`flex-1 font-medium text-claimondo-navy ${r.mono ? 'font-mono' : ''}`}
                >
                  {r.value}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
}

function aufbauLabel(raw: string): string {
  const map: Record<string, string> = {
    limousine: 'Limousine',
    kombi: 'Kombi',
    suv: 'SUV',
    coupe: 'Coupé',
    cabrio: 'Cabrio',
    transporter: 'Transporter',
    caravan: 'Wohnwagen / Caravan',
    motorrad: 'Motorrad',
    oldtimer: 'Oldtimer',
    elektro: 'Elektrofahrzeug',
  }
  return map[raw.toLowerCase()] ?? raw
}

function kraftstoffLabel(raw: string): string {
  const map: Record<string, string> = {
    benzin: 'Benzin',
    diesel: 'Diesel',
    elektro: 'Elektro',
    hybrid: 'Hybrid',
    plugin_hybrid: 'Plug-in Hybrid',
    erdgas: 'Erdgas (CNG)',
    autogas: 'Autogas (LPG)',
    wasserstoff: 'Wasserstoff',
  }
  return map[raw.toLowerCase()] ?? raw
}

function schadenartLabel(raw: string): string {
  const map: Record<string, string> = {
    haftpflicht: 'Haftpflichtschaden',
    haftpflicht_eindeutig: 'Haftpflichtschaden (eindeutig)',
    haftpflicht_strittig: 'Haftpflichtschaden (strittig)',
    kasko: 'Kaskoschaden',
    teilschuld: 'Teilschuld',
    totalschaden: 'Totalschaden',
  }
  return map[raw.toLowerCase()] ?? raw
}
