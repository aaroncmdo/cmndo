'use client'

// CMM-32 Polish: iOS-style read-only Claim-Übersicht.
//
// Layout (Desktop):
//   ┌─────────────────────────────────────────────────────────────┐
//   │ {Halter}'s {Modell}                                         │
//   │ CLM-…  ·  K-AS 2014                                         │
//   ├─────────────────────────┬───────────────────────────────────┤
//   │ [Auto-Render]           │ [Glassy Tabs] Unfall · Dokumente  │
//   │ [Kennzeichenhalter]     │                                   │
//   │ Hersteller, Modell,     │ Tab-Inhalt in Glassy-Panel        │
//   │ EZ, KM-Stand            │                                   │
//   │ [Aufbau][FIN][Antrieb]  │                                   │
//   └─────────────────────────┴───────────────────────────────────┘
//
// Mobile: stacked, Tabs unter den Stammdaten.

import { useState } from 'react'
import {
  CarFrontIcon,
  CalendarIcon,
  GaugeIcon,
  HashIcon,
  FuelIcon,
  Disc3Icon,
  AlertOctagonIcon,
  FolderOpenIcon,
  MapPinIcon,
  PhoneIcon,
  MailIcon,
  ShieldIcon,
  UsersIcon,
  InfoIcon,
  UploadCloudIcon,
  EuroIcon,
  DownloadIcon,
  ClockIcon,
} from 'lucide-react'
import Kennzeichenhalter from './Kennzeichenhalter'
import FahrzeugRenderImage from '@/components/fahrzeug/FahrzeugRenderImage'
import type { LackfarbeCode } from '@/lib/fahrzeug/imagin'

export type ClaimSummaryDokument = {
  id: string
  typ: string
  datei_url: string
  datei_name: string | null
  created_at: string
}

type FallSummary = {
  // Identifikation
  claim_nummer: string | null
  // Fahrzeug
  kennzeichen: string | null
  kennzeichen_kreis?: string | null
  kennzeichen_buchstaben?: string | null
  kennzeichen_zahl?: string | null
  kennzeichen_suffix?: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  erstzulassung: string | null
  kilometerstand: number | null
  fahrzeug_aufbau: string | null
  fahrzeug_baujahr: number | null
  lackfarbe: LackfarbeCode | null
  kraftstoff: string | null
  fahrgestellnummer: string | null
  // Schadensort fuer das Render-Panel
  schadens_adresse: string | null
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
  // Kontakt-Kunde
  kunde_vorname: string | null
  kunde_nachname: string | null
}

type AnspruchPosition = {
  key: string
  label: string
  detail?: string | null
  betragEur: number
}

const TABS = [
  { key: 'unfall', label: 'Unfall & Beteiligte', icon: AlertOctagonIcon },
  { key: 'anspruch', label: 'Mein Anspruch', icon: EuroIcon },
  { key: 'dokumente', label: 'Dokumente', icon: FolderOpenIcon },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function ClaimSummary({
  data,
  dokumente,
  uploadSlot,
  anspruch,
}: {
  data: FallSummary
  dokumente?: ClaimSummaryDokument[]
  /** Slot für die BelegUploadCard — Page rendert sie, hier nur eingebunden. */
  uploadSlot?: React.ReactNode
  anspruch?: {
    positionen: AnspruchPosition[] | null
    totalEur: number | null
    gutachtenFreigegeben: boolean
    gutachtenUrl?: string | null
  }
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('unfall')

  // "Serkan's 5er" — bevorzugt Halter-Vorname (oder Kunde wenn er der Halter ist),
  // Fallback Hersteller/Modell-only.
  const eigentumsVorname =
    data.halter_ist_kunde === true || !data.halter_vorname
      ? data.kunde_vorname
      : data.halter_vorname
  const titelLinks = data.fahrzeug_modell ?? data.fahrzeug_hersteller ?? 'Fahrzeug'
  const titel = eigentumsVorname
    ? `${eigentumsVorname}'s ${titelLinks}`
    : [data.fahrzeug_hersteller, data.fahrzeug_modell].filter(Boolean).join(' ') || 'Dein Fahrzeug'

  const subtitelTeile = [data.claim_nummer, data.kennzeichen].filter(Boolean)

  return (
    <section
      className="rounded-2xl bg-white border border-claimondo-border overflow-hidden"
      style={{
        boxShadow: [
          'inset 0 1px 0 rgba(255,255,255,0.95)',
          'inset 1px 0 0 rgba(255,255,255,0.65)',
          'inset 0 -1px 0 rgba(13,27,62,0.06)',
          'inset -1px 0 0 rgba(13,27,62,0.04)',
          '0 2px 16px rgba(13,27,62,0.07)',
          '0 8px 32px rgba(13,27,62,0.05)',
        ].join(', '),
      }}
    >
      {/* Header — gleiche Sprache wie ClaimStepper */}
      <header className="px-4 sm:px-6 py-4 sm:py-5 border-b border-claimondo-navy/10 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo/60 font-semibold">
            {subtitelTeile.length > 0 ? subtitelTeile.join(' · ') : 'Schadensfall'}
          </p>
          <h2 className="text-lg sm:text-xl font-bold text-claimondo-navy leading-tight mt-0.5 truncate">
            {titel}
          </h2>
        </div>
        {/* Fahrzeug-Logo im Header — kompakt, dunkel */}
        <div
          className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0D1B3E 0%, #14254f 100%)' }}
        >
          <FahrzeugRenderImage
            hersteller={data.fahrzeug_hersteller}
            modell={data.fahrzeug_modell}
            lackfarbe={data.lackfarbe}
            baujahr={data.fahrzeug_baujahr}
            width={48}
            className="object-contain"
            dark
          />
        </div>
      </header>

      {/* Body — zwei Spalten ab lg */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,280px)_1fr]">
        {/* ─── Linke Spalte: Fahrzeug-Stammdaten ─── */}
        <div className="px-4 sm:px-6 py-5 lg:border-r border-claimondo-navy/10 bg-claimondo-bg space-y-4">
          {/* Kennzeichenhalter zentriert */}
          <div className="flex justify-center pt-1">
            <Kennzeichenhalter
              kennzeichen={data.kennzeichen}
              kreis={data.kennzeichen_kreis}
              buchstaben={data.kennzeichen_buchstaben}
              zahl={data.kennzeichen_zahl}
              suffix={data.kennzeichen_suffix}
              size="md"
            />
          </div>

          {/* Schadensort kompakt */}
          {(data.schadens_adresse ?? buildSchadensortFallback(data)) && (
            <div className="rounded-lg border border-claimondo-border bg-white px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/60 font-semibold flex items-center gap-1">
                <MapPinIcon className="w-3 h-3" /> Schadensort
              </p>
              <p className="text-xs text-claimondo-navy mt-0.5 leading-snug">
                {data.schadens_adresse ?? buildSchadensortFallback(data)}
              </p>
            </div>
          )}

          {/* Stammdaten-Tabelle */}
          <dl className="divide-y divide-claimondo-border">
            <Row label="Hersteller" value={data.fahrzeug_hersteller} />
            <Row label="Modell" value={data.fahrzeug_modell} />
            <Row
              label="Erstzulassung"
              value={data.erstzulassung ? formatDate(data.erstzulassung) : null}
            />
            <Row
              label="KM-Stand"
              value={
                data.kilometerstand != null
                  ? `${data.kilometerstand.toLocaleString('de-DE')} km`
                  : null
              }
            />
          </dl>

          {/* Chips */}
          {(data.fahrzeug_aufbau || data.kraftstoff || data.fahrgestellnummer || data.kennzeichen_suffix) && (
            <div className="flex flex-wrap gap-1.5">
              {data.fahrzeug_aufbau && (
                <Chip icon={CarFrontIcon} label={aufbauLabel(data.fahrzeug_aufbau)} />
              )}
              {data.kraftstoff && (
                <Chip icon={FuelIcon} label={kraftstoffLabel(data.kraftstoff)} />
              )}
              {data.fahrgestellnummer && (
                <Chip icon={HashIcon} label={`FIN •••${data.fahrgestellnummer.slice(-4)}`} mono />
              )}
              {data.kennzeichen_suffix === 'E' && <Chip icon={Disc3Icon} label="Elektro" />}
              {data.kennzeichen_suffix === 'H' && <Chip icon={Disc3Icon} label="Oldtimer" />}
            </div>
          )}
        </div>

        {/* ─── Rechte Spalte: Tabs ─── */}
        <div className="flex flex-col">
          {/* Tab-Leiste — Stepper-Style: border-b, nicht pill-in-padding */}
          <div className="flex items-center gap-0 border-b border-claimondo-navy/10 px-4 sm:px-6 overflow-x-auto">
            {TABS.map((tab) => {
              const TabIcon = tab.icon
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-3.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors -mb-px ${
                    active
                      ? 'border-claimondo-navy text-claimondo-navy'
                      : 'border-transparent text-claimondo-ondo/60 hover:text-claimondo-navy'
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab-Inhalt */}
          <div className="px-4 sm:px-6 py-5 flex-1">
            {activeTab === 'unfall' && <UnfallTab data={data} />}
            {activeTab === 'anspruch' && (
              <AnspruchTab
                positionen={anspruch?.positionen ?? null}
                totalEur={anspruch?.totalEur ?? null}
                gutachtenFreigegeben={anspruch?.gutachtenFreigegeben ?? false}
                gutachtenUrl={anspruch?.gutachtenUrl ?? null}
              />
            )}
            {activeTab === 'dokumente' && (
              <DokumenteTab dokumente={dokumente ?? []} uploadSlot={uploadSlot} />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Auto-Render (oben links) ─────────────────────────────────────────────

function CarRender({
  hersteller,
  modell,
  baujahr,
  lackfarbe,
  schadensAdresse,
}: {
  hersteller: string | null
  modell: string | null
  baujahr: number | null
  lackfarbe: LackfarbeCode | null
  schadensAdresse: string | null
}) {
  return (
    <div className="space-y-3">
      {/* Imagin-Studio-Render mit Mehrstufen-Fallback (Logo → Auto-Bild → Icon) */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#f4f6fb] via-[#eef1f8] to-[#e6ebf5] border border-claimondo-border/50 flex items-center justify-center p-3 min-h-[140px]">
        <FahrzeugRenderImage
          hersteller={hersteller}
          modell={modell}
          lackfarbe={lackfarbe}
          baujahr={baujahr}
          width={240}
          className="max-w-full"
        />
      </div>
      {/* Schadensort */}
      {schadensAdresse && (
        <div className="rounded-xl bg-white/70 border border-claimondo-border/50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold flex items-center gap-1.5">
            <MapPinIcon className="w-3 h-3" /> Schadensort
          </p>
          <p className="text-xs text-claimondo-navy mt-0.5 leading-snug">
            {schadensAdresse}
          </p>
        </div>
      )}
    </div>
  )
}

function buildSchadensortFallback(d: { schadens_plz: string | null; schadens_ort: string | null }) {
  return [d.schadens_plz, d.schadens_ort].filter(Boolean).join(' ') || null
}

// ─── Tabs ─────────────────────────────────────────────────────────────────

function UnfallTab({ data }: { data: FallSummary }) {
  const ort = [data.schadens_plz, data.schadens_ort].filter(Boolean).join(' ') || null
  const halterName =
    data.halter_ist_kunde
      ? [data.kunde_vorname, data.kunde_nachname].filter(Boolean).join(' ') || null
      : [data.halter_vorname, data.halter_nachname].filter(Boolean).join(' ') || null

  return (
    <div className="space-y-5">
      {/* Unfall-Daten */}
      <div>
        <SectionLabel icon={AlertOctagonIcon}>Unfall</SectionLabel>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-2.5">
          <Field
            icon={CalendarIcon}
            label="Schadensdatum"
            value={data.schadens_datum ? formatDate(data.schadens_datum) : null}
          />
          <Field icon={MapPinIcon} label="Ort" value={ort} />
          <Field
            icon={ShieldIcon}
            label="Schadensart"
            value={data.schadenart ? schadenartLabel(data.schadenart) : null}
          />
        </dl>
        {data.schadens_beschreibung && (
          <div className="mt-3 rounded-xl bg-white/70 border border-claimondo-border/50 px-3.5 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/60 font-semibold">
              Unfallhergang
            </p>
            <p className="text-sm text-claimondo-navy whitespace-pre-wrap leading-relaxed mt-0.5">
              {data.schadens_beschreibung}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-claimondo-border/40 pt-4">
        <SectionLabel icon={UsersIcon}>Beteiligte</SectionLabel>
        <div className="mt-2.5 space-y-3">
          <PartyRow
            title="Halter"
            primary={halterName}
            secondary={
              data.halter_ist_kunde === false ? 'Halter ist nicht der Geschädigte' : null
            }
          />
          {data.vs_eigener_name && (
            <PartyRow title="Deine Versicherung" primary={data.vs_eigener_name} />
          )}
          <PartyRow
            title="Gegnerische Versicherung"
            primary={data.vs_gegner_name}
            extra={
              <div className="space-y-0.5 text-xs text-claimondo-navy">
                {data.vs_gegner_schaden_nr && (
                  <div className="flex items-center gap-1.5">
                    <HashIcon className="w-3 h-3 text-claimondo-ondo/60" />
                    <span className="font-mono">{data.vs_gegner_schaden_nr}</span>
                  </div>
                )}
                {data.vs_gegner_telefon && (
                  <div className="flex items-center gap-1.5">
                    <PhoneIcon className="w-3 h-3 text-claimondo-ondo/60" />
                    <span>{data.vs_gegner_telefon}</span>
                  </div>
                )}
                {data.vs_gegner_email && (
                  <div className="flex items-center gap-1.5">
                    <MailIcon className="w-3 h-3 text-claimondo-ondo/60" />
                    <span className="font-mono">{data.vs_gegner_email}</span>
                  </div>
                )}
              </div>
            }
          />
        </div>
      </div>
    </div>
  )
}

function AnspruchTab({
  positionen,
  totalEur,
  gutachtenFreigegeben,
  gutachtenUrl,
}: {
  positionen: AnspruchPosition[] | null
  totalEur: number | null
  gutachtenFreigegeben: boolean
  gutachtenUrl: string | null
}) {
  const fmt = (eur: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.abs(eur))

  if (!gutachtenFreigegeben) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <span className="w-12 h-12 rounded-full bg-claimondo-navy/[0.06] flex items-center justify-center">
          <ClockIcon className="w-6 h-6 text-claimondo-ondo/60" />
        </span>
        <p className="text-sm font-semibold text-claimondo-navy">Wird nach Begutachtung befüllt</p>
        <p className="text-xs text-claimondo-ondo/70 max-w-[240px]">
          Sobald der Gutachter seinen Bericht abgeschlossen und freigegeben hat, sehen Sie hier Ihre Schadensberechnung.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionLabel icon={EuroIcon}>Schadensberechnung</SectionLabel>

      {positionen && positionen.length > 0 ? (
        <div className="rounded-xl bg-white/80 border border-claimondo-border/50 overflow-hidden">
          <ul className="divide-y divide-claimondo-border/40">
            {positionen.map((pos) => (
              <li key={pos.key} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-claimondo-navy">{pos.label}</p>
                  {pos.detail && (
                    <p className="text-[11px] text-claimondo-ondo/70 mt-0.5">{pos.detail}</p>
                  )}
                </div>
                <span
                  className={`text-sm font-semibold shrink-0 ${
                    pos.betragEur < 0 ? 'text-red-600' : 'text-claimondo-navy'
                  }`}
                >
                  {pos.betragEur < 0 ? `− ${fmt(pos.betragEur)}` : fmt(pos.betragEur)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-claimondo-ondo/60 italic">Keine Einzelpositionen verfügbar.</p>
      )}

      {totalEur != null && (
        <div className="rounded-xl bg-claimondo-navy px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/60 font-semibold">
              Ihr Gesamtanspruch
            </p>
            <p className="text-2xl font-extrabold text-white leading-tight mt-0.5">
              {fmt(totalEur)}
            </p>
          </div>
          <EuroIcon className="w-8 h-8 text-white/30 shrink-0" />
        </div>
      )}

      {gutachtenUrl && (
        <a
          href={gutachtenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 w-full rounded-xl border border-claimondo-border/60 bg-white/80 hover:bg-white transition-colors px-4 py-3"
        >
          <DownloadIcon className="w-4 h-4 text-claimondo-ondo/70 shrink-0" />
          <span className="text-sm font-medium text-claimondo-navy flex-1">Gutachten herunterladen</span>
          <span className="text-[11px] text-claimondo-ondo/60">PDF</span>
        </a>
      )}
    </div>
  )
}

function DokumenteTab({
  dokumente,
  uploadSlot,
}: {
  dokumente: ClaimSummaryDokument[]
  uploadSlot?: React.ReactNode
}) {
  const grouped = dokumente.reduce<Record<string, ClaimSummaryDokument[]>>((acc, d) => {
    const key = d.typ || 'sonstiges'
    if (!acc[key]) acc[key] = []
    acc[key].push(d)
    return acc
  }, {})
  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    if (a === 'gutachten') return -1
    if (b === 'gutachten') return 1
    return (TYP_LABEL[a] ?? a).localeCompare(TYP_LABEL[b] ?? b)
  })

  return (
    <div className="space-y-4">
      {uploadSlot && (
        <div className="rounded-xl bg-white/80 border border-claimondo-border/50 p-3">
          <SectionLabel icon={UploadCloudIcon}>Hochladen</SectionLabel>
          <div className="mt-2">{uploadSlot}</div>
        </div>
      )}

      {dokumente.length === 0 ? (
        <p className="text-sm text-claimondo-ondo/70 italic">Noch keine Dokumente vorhanden.</p>
      ) : (
        <div className="space-y-3">
          {sortedKeys.map((typ) => (
            <div
              key={typ}
              className="rounded-xl bg-white/70 border border-claimondo-border/50 px-4 py-3"
            >
              <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-2">
                {TYP_LABEL[typ] ?? typ}
              </p>
              <ul className="space-y-1.5">
                {grouped[typ].map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-claimondo-navy truncate">{d.datei_name ?? 'Dokument'}</span>
                    <a
                      href={d.datei_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs font-semibold text-claimondo-shield hover:text-claimondo-navy underline underline-offset-2"
                    >
                      Öffnen
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between py-2 gap-3">
      <dt className="text-xs text-claimondo-ondo/80">{label}</dt>
      <dd
        className={`text-sm font-semibold text-right truncate ${
          value == null ? 'text-claimondo-ondo/40 italic font-normal' : 'text-claimondo-navy'
        }`}
      >
        {value ?? 'nicht angegeben'}
      </dd>
    </div>
  )
}

function Chip({
  icon: Icon,
  label,
  mono,
}: {
  icon: typeof CarFrontIcon
  label: string
  mono?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-claimondo-navy/[0.05] border border-claimondo-navy/10 px-2.5 py-1 text-[11px] text-claimondo-navy ${
        mono ? 'font-mono' : ''
      }`}
    >
      <Icon className="w-3 h-3 text-claimondo-ondo/70" />
      {label}
    </span>
  )
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: typeof CarFrontIcon
  children: React.ReactNode
}) {
  return (
    <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold flex items-center gap-1.5">
      <Icon className="w-3 h-3" />
      {children}
    </p>
  )
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CarFrontIcon
  label: string
  value: string | null
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-claimondo-ondo/70 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/60 font-semibold">
          {label}
        </p>
        <p
          className={`text-sm truncate ${
            value == null ? 'text-claimondo-ondo/40 italic' : 'text-claimondo-navy font-medium'
          }`}
        >
          {value ?? 'nicht angegeben'}
        </p>
      </div>
    </div>
  )
}

function PartyRow({
  title,
  primary,
  secondary,
  extra,
}: {
  title: string
  primary: string | null
  secondary?: string | null
  extra?: React.ReactNode
}) {
  if (!primary && !extra) {
    return (
      <div className="rounded-xl bg-white/50 border border-claimondo-border/50 px-3.5 py-2.5">
        <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/60 font-semibold">
          {title}
        </p>
        <p className="text-xs text-claimondo-ondo/60 italic flex items-center gap-1 mt-0.5">
          <InfoIcon className="w-3 h-3" /> Noch keine Angaben
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-xl bg-white/70 border border-claimondo-border/50 px-3.5 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/60 font-semibold">
        {title}
      </p>
      {primary && <p className="text-sm font-semibold text-claimondo-navy">{primary}</p>}
      {secondary && <p className="text-[11px] text-claimondo-ondo/70">{secondary}</p>}
      {extra && <div className="mt-1.5">{extra}</div>}
    </div>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'long', year: 'numeric' })
}

function aufbauLabel(raw: string): string {
  const map: Record<string, string> = {
    limousine: 'Limousine',
    kombi: 'Kombi',
    suv: 'SUV',
    coupe: 'Coupé',
    cabrio: 'Cabrio',
    transporter: 'Transporter',
    caravan: 'Wohnwagen',
    motorrad: 'Motorrad',
    oldtimer: 'Oldtimer',
    lkw: 'LKW',
    sonstiges: 'Sonstiges',
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
    haftpflicht_eindeutig: 'Haftpflicht (eindeutig)',
    haftpflicht_strittig: 'Haftpflicht (strittig)',
    kasko: 'Kaskoschaden',
    teilschuld: 'Teilschuld',
    totalschaden: 'Totalschaden',
  }
  return map[raw.toLowerCase()] ?? raw
}

const TYP_LABEL: Record<string, string> = {
  gutachten: 'Gutachten',
  gutachten_anlage: 'Gutachten-Anlagen',
  schadenanzeige: 'Schadenanzeige',
  versicherungsschein: 'Versicherungsschein',
  fahrzeugschein: 'Fahrzeugschein',
  fuehrerschein: 'Führerschein',
  polizeibericht: 'Polizeibericht',
  zulassungsbescheinigung: 'Zulassungsbescheinigung',
  kostenvoranschlag: 'Kostenvoranschlag',
  werkstattrechnung: 'Werkstattrechnung',
  mietwagenrechnung: 'Mietwagenrechnung',
  foto: 'Fotos',
  'kunde-nachreichung': 'Sonstige (von Ihnen)',
  sonstiges: 'Sonstiges',
}
