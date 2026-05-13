'use client'

// AAR-487 (M5): Makler-Akte-Detail — Client-Komponente mit Header, Quick-
// Stats, 5-Tab-Navigation (3 aktive Panels + 2 Placeholder für M6/M7).
// URL-State-Sync via ?tab=.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeftIcon,
  PhoneIcon,
  EuroIcon,
  ShieldCheckIcon,
  CalendarIcon,
  FileTextIcon,
  LayoutListIcon,
  MessageSquareIcon,
  SparklesIcon,
  CheckCircle2Icon,
  CircleIcon,
  CircleDotIcon,
  ArrowRightIcon,
} from 'lucide-react'
import type {
  FallDetail,
  FallDetailDocument,
  TimelineEvent,
  MaklerRow,
  MaklerChatMessage,
} from '@/lib/makler/queries'
import { MaklerChatTab } from './MaklerChatTab'
import { MaklerCopilotTab } from './MaklerCopilotTab'
// AAR-727 Kandidat 1: Shared Download-Liste — Makler nutzt grid-Variante.
import DokumenteDownloadListe, { type DokumentItem } from '@/components/shared/DokumenteDownloadListe'
import { SectionCard } from '@/components/shared/SectionCard'
import EmptyState from '@/components/shared/EmptyState'

type TabKey = 'overview' | 'timeline' | 'documents' | 'chat' | 'copilot'

type Props = {
  detail: FallDetail
  signedUrls: Record<string, string | null>
  initialTab: TabKey
  makler: MaklerRow
  currentUserId: string
  initialChatMessages: MaklerChatMessage[]
}

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const DATE_TIME = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  return DATE.format(new Date(iso))
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '–'
  return DATE_TIME.format(new Date(iso))
}
function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined) return '–'
  return EUR.format(v)
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
}

function fullName(
  p: { vorname: string | null; nachname: string | null } | null,
): string {
  if (!p) return '–'
  return [p.vorname, p.nachname].filter(Boolean).join(' ') || '–'
}

export function MaklerAkteDetail({
  detail,
  signedUrls,
  initialTab,
  currentUserId,
  initialChatMessages,
}: Props) {
  const [tab, setTab] = useState<TabKey>(initialTab)
  const router = useRouter()
  const searchParams = useSearchParams()

  const { fall, kunde, provision, documents, timeline } = detail

  function selectTab(next: TabKey) {
    setTab(next)
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (next === 'overview') params.delete('tab')
    else params.set('tab', next)
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '?')
  }

  const gesamtforderung = useMemo(() => {
    const parts = [
      fall.reparaturkosten,
      fall.wertminderung,
      fall.nutzungsausfall_gesamt,
      fall.gutachter_honorar,
    ]
    const sum = parts.reduce<number>(
      (s, v) => (v !== null && v !== undefined ? s + Number(v) : s),
      0,
    )
    return sum > 0 ? sum : null
  }, [fall])

  const estimateShown = fall.schadens_hoehe_netto ?? gesamtforderung

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-claimondo-ondo">
        <Link href="/makler/akten" className="inline-flex items-center gap-1 hover:text-claimondo-navy">
          <ArrowLeftIcon width={12} height={12} /> Meine Akten
        </Link>
        <span aria-hidden>/</span>
        <span className="text-claimondo-navy font-mono">
          {fall.fall_nummer ?? fall.id.slice(0, 8)}
        </span>
      </nav>

      {/* Header-Card */}
      <header className="relative rounded-ios-md overflow-hidden bg-gradient-to-br from-claimondo-navy via-claimondo-shield to-claimondo-navy p-6 md:p-8 text-white">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{fullName(kunde)}</h1>
            <p className="text-sm text-claimondo-shield mt-1 truncate">
              <span className="font-mono">
                {fall.fall_nummer ?? fall.id.slice(0, 8)}
              </span>
              {' · '}
              {[fall.fahrzeug_hersteller, fall.fahrzeug_modell]
                .filter(Boolean)
                .join(' ') || 'Fahrzeug unbekannt'}
              {fall.unfalldatum ? ` · Unfall ${fmtDate(fall.unfalldatum)}` : ''}
            </p>
            <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white">
              {fall.aktuelle_phase ?? fall.status}
            </div>
          </div>
          {kunde?.telefon ? (
            <a
              href={`tel:${kunde.telefon}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-claimondo-navy text-sm font-semibold hover:bg-claimondo-light-blue/20"
            >
              <PhoneIcon width={16} height={16} />
              Kunde anrufen
            </a>
          ) : null}
        </div>
      </header>

      {/* Quick-Stats */}
      <section
        aria-label="Kennzahlen"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <QuickStat
          label="Geschätzte Regulierung"
          value={fmtEur(estimateShown)}
          icon={<EuroIcon width={16} height={16} />}
        />
        <QuickStat
          label="Ihre Provision"
          value={provision ? fmtEur(provision.betrag_netto_eur) : '–'}
          hint={provision ? provision.status : undefined}
          icon={<EuroIcon width={16} height={16} />}
        />
        <QuickStat
          label="Consent"
          value="Vollzugriff"
          icon={<ShieldCheckIcon width={16} height={16} />}
          valueClass="text-emerald-700"
        />
        <QuickStat
          label="Fall seit"
          value={`${daysSince(fall.created_at)} Tagen`}
          icon={<CalendarIcon width={16} height={16} />}
        />
      </section>

      {/* Tab-Navigation */}
      <div
        role="tablist"
        aria-label="Akte-Details"
        className="flex gap-1 border-b border-claimondo-border overflow-x-auto"
      >
        <TabButton
          active={tab === 'overview'}
          onClick={() => selectTab('overview')}
          label="Übersicht"
          icon={<LayoutListIcon width={15} height={15} />}
        />
        <TabButton
          active={tab === 'timeline'}
          onClick={() => selectTab('timeline')}
          label="Timeline"
          icon={<CalendarIcon width={15} height={15} />}
        />
        <TabButton
          active={tab === 'documents'}
          onClick={() => selectTab('documents')}
          label="Dokumente"
          icon={<FileTextIcon width={15} height={15} />}
          count={documents.length}
        />
        <TabButton
          active={tab === 'chat'}
          onClick={() => selectTab('chat')}
          label="Chat"
          icon={<MessageSquareIcon width={15} height={15} />}
        />
        <TabButton
          active={tab === 'copilot'}
          onClick={() => selectTab('copilot')}
          label="Copilot"
          icon={<SparklesIcon width={15} height={15} />}
        />
      </div>

      {/* Panels */}
      {tab === 'overview' ? (
        <OverviewPanel detail={detail} gesamtforderung={gesamtforderung} />
      ) : null}
      {tab === 'timeline' ? <TimelinePanel events={timeline} /> : null}
      {tab === 'documents' ? (
        <DocumentsPanel docs={documents} signedUrls={signedUrls} />
      ) : null}
      {tab === 'chat' ? (
        <MaklerChatTab
          fallId={fall.id}
          currentUserId={currentUserId}
          initialMessages={initialChatMessages}
        />
      ) : null}
      {tab === 'copilot' ? (
        <MaklerCopilotTab
          fallId={fall.id}
          gegnerVsName={fall.gegner_versicherung}
          kontextLoaded
        />
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Header-Bauteile
// ─────────────────────────────────────────────────────────────────────────────

function QuickStat({
  label,
  value,
  icon,
  hint,
  valueClass,
}: {
  label: string
  value: string
  icon: React.ReactNode
  hint?: string
  valueClass?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-claimondo-border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-claimondo-ondo">{label}</span>
        <span className="text-claimondo-ondo">{icon}</span>
      </div>
      <p className={`text-lg font-semibold text-claimondo-navy ${valueClass ?? ''}`}>
        {value}
      </p>
      {hint ? <p className="text-[11px] text-claimondo-ondo mt-0.5">{hint}</p> : null}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  icon,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: React.ReactNode
  count?: number
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-2 px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
        active
          ? 'border-claimondo-navy text-claimondo-navy font-semibold'
          : 'border-transparent text-claimondo-ondo hover:text-claimondo-navy'
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 ? (
        <span
          className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-medium ${
            active ? 'bg-claimondo-navy text-white' : 'bg-claimondo-border text-claimondo-navy'
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview Panel
// ─────────────────────────────────────────────────────────────────────────────

function OverviewPanel({
  detail,
  gesamtforderung,
}: {
  detail: FallDetail
  gesamtforderung: number | null
}) {
  const { fall, kunde } = detail
  const hasGutachten =
    fall.reparaturkosten !== null ||
    fall.wertminderung !== null ||
    fall.gutachter_honorar !== null

  return (
    <div className="space-y-6">
      {/* Nächster Schritt Banner */}
      <NextStepBanner fall={fall} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InfoCard title="Kunde">
          <InfoRow label="Name" value={fullName(kunde)} />
          <InfoRow label="Email" value={kunde?.email ?? '–'} />
          <InfoRow label="Telefon" value={kunde?.telefon ?? '–'} />
          <InfoRow
            label="Anschrift"
            value={
              kunde
                ? [kunde.adresse, `${kunde.plz ?? ''} ${kunde.ort ?? ''}`.trim()]
                    .filter(Boolean)
                    .join(', ') || '–'
                : '–'
            }
          />
        </InfoCard>

        <InfoCard title="Fall">
          <InfoRow label="Unfalldatum" value={fmtDate(fall.unfalldatum)} />
          <InfoRow label="Ort" value={fall.unfallort ?? '–'} />
          <InfoRow label="Schadenart" value={fall.schadens_art ?? '–'} />
          <InfoRow label="Service" value={fall.service_typ ?? '–'} />
          {fall.unfallhergang ? (
            <div className="pt-2 border-t border-claimondo-border mt-2">
              <p className="text-[11px] text-claimondo-ondo mb-1">Hergang</p>
              <p className="text-sm text-claimondo-navy whitespace-pre-wrap">
                {fall.unfallhergang}
              </p>
            </div>
          ) : null}
        </InfoCard>

        <InfoCard title="Fahrzeug">
          <InfoRow label="Kennzeichen" value={fall.kennzeichen ?? '–'} />
          <InfoRow
            label="Marke/Modell"
            value={
              [fall.fahrzeug_hersteller, fall.fahrzeug_modell]
                .filter(Boolean)
                .join(' ') || '–'
            }
          />
          <InfoRow
            label="Baujahr"
            value={fall.fahrzeug_baujahr ? String(fall.fahrzeug_baujahr) : '–'}
          />
          <InfoRow label="Erstzulassung" value={fall.erstzulassung ?? '–'} />
          <InfoRow
            label="Kilometerstand"
            value={
              fall.kilometerstand
                ? `${fall.kilometerstand.toLocaleString('de-DE')} km`
                : '–'
            }
          />
          <InfoRow label="FIN" value={fall.fin_vin ?? '–'} />
        </InfoCard>

        <InfoCard title="Gegenseite & Versicherung">
          <InfoRow label="Gegner" value={fall.gegner_name ?? '–'} />
          <InfoRow label="Kennzeichen" value={fall.gegner_kennzeichen ?? '–'} />
          <InfoRow
            label="Versicherung"
            value={fall.gegner_versicherung ?? '–'}
          />
          <InfoRow
            label="Schaden-Nr."
            value={fall.gegner_schadennummer ?? '–'}
          />
        </InfoCard>
      </div>

      {hasGutachten ? (
        <SectionCard
          title="Gutachten-Ergebnis"
          bodyClassName="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3"
        >
            <InfoRow label="Reparaturkosten" value={fmtEur(fall.reparaturkosten)} />
            <InfoRow label="Wiederbeschaffungswert" value={fmtEur(fall.wiederbeschaffungswert)} />
            <InfoRow label="Wertminderung" value={fmtEur(fall.wertminderung)} />
            <InfoRow label="Restwert" value={fmtEur(fall.restwert)} />
            <InfoRow
              label="Nutzungsausfall"
              value={fmtEur(fall.nutzungsausfall_gesamt)}
            />
            <InfoRow
              label="Totalschaden"
              value={fall.totalschaden ? 'Ja' : 'Nein'}
            />
            <InfoRow
              label="Gutachter-Honorar"
              value={fmtEur(fall.gutachter_honorar)}
            />
            <div className="flex justify-between items-center py-1 border-t border-claimondo-border mt-2 pt-3">
              <span className="text-sm font-semibold text-claimondo-navy">
                Gesamtforderung
              </span>
              <span className="text-lg font-bold text-claimondo-navy">
                {fmtEur(gesamtforderung)}
              </span>
            </div>
        </SectionCard>
      ) : null}
    </div>
  )
}

function NextStepBanner({ fall }: { fall: FallDetail['fall'] }) {
  const copy: Record<string, string> = {
    ersterfassung: 'Fall wird noch erfasst — Sie erhalten Update bei Onboarding.',
    onboarding: 'Kunde im Onboarding — Abtretung & Vollmacht werden eingeholt.',
    'sv-gesucht': 'Sachverständiger wird gesucht.',
    'sv-zugewiesen': 'SV zugewiesen — Termin wird vereinbart.',
    'sv-termin': `SV-Termin${fall.sv_termin ? ` am ${fmtDate(fall.sv_termin)}` : ''}.`,
    besichtigung: 'Besichtigung läuft.',
    'begutachtung-laeuft': 'Gutachten wird erstellt.',
    'gutachten-eingegangen': 'Gutachten eingegangen — QC-Prüfung läuft.',
    filmcheck: 'Filmcheck läuft.',
    'qc-pruefung': 'Interne QC-Prüfung.',
    'kanzlei-uebergeben': 'An Kanzlei übergeben — Anschlussschreiben folgt.',
    anschlussschreiben: 'Anschlussschreiben an Versicherung versendet.',
    regulierung: 'Warten auf Regulierung.',
    'regulierung-laeuft': 'Regulierung läuft.',
    'nachbesichtigung-laeuft': 'Nachbesichtigung läuft.',
    'vs-abgelehnt': 'Versicherung hat abgelehnt — Eskalation läuft.',
    'zahlung-eingegangen': 'Zahlung eingegangen.',
    abgeschlossen: 'Fall abgeschlossen.',
    storniert: 'Fall storniert.',
  }
  const text = copy[fall.status] ?? `Aktuelle Phase: ${fall.status}`
  return (
    <div className="rounded-ios-md bg-claimondo-ondo/10 border border-claimondo-ondo/20 p-4 flex items-start gap-3">
      <span className="shrink-0 mt-0.5 text-claimondo-navy">
        <ArrowRightIcon width={18} height={18} />
      </span>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo font-medium">
          Nächster Schritt
        </p>
        <p className="text-sm text-claimondo-navy mt-0.5">{text}</p>
      </div>
    </div>
  )
}

// AAR-frontend-konsolidierung-p2 (P2-T3): dünner Adapter — shared SectionCard mit
// space-y-2-Body, kein eigenes Card-Markup mehr.
function InfoCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <SectionCard title={title} bodyClassName="space-y-2">
      {children}
    </SectionCard>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-xs text-claimondo-ondo shrink-0">{label}</dt>
      <dd className="text-sm text-claimondo-navy text-right break-words">{value}</dd>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Panel
// ─────────────────────────────────────────────────────────────────────────────

function TimelinePanel({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="Noch keine Timeline-Events." />
  }
  return (
    <SectionCard title="Timeline">
      <ol className="relative border-l-2 border-claimondo-border pl-6 space-y-4">
        {events.map((e, idx) => (
          <li key={`${e.timestamp}-${idx}`} className="relative">
            <span className="absolute -left-[31px] flex items-center justify-center">
              {e.kind === 'done' ? (
                <CheckCircle2Icon
                  width={18}
                  height={18}
                  className="text-emerald-600 bg-white"
                />
              ) : e.kind === 'current' ? (
                <CircleDotIcon
                  width={18}
                  height={18}
                  className="text-claimondo-ondo bg-white animate-pulse"
                />
              ) : (
                <CircleIcon
                  width={18}
                  height={18}
                  className="text-claimondo-ondo/70 bg-white"
                />
              )}
            </span>
            <p className="text-sm font-medium text-claimondo-navy">{e.title}</p>
            <p className="text-xs text-claimondo-ondo mt-0.5">
              {fmtDateTime(e.timestamp)}
              {e.meta ? ` · ${e.meta}` : ''}
            </p>
          </li>
        ))}
      </ol>
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents Panel — AAR-727 Kandidat 1: shared DokumenteDownloadListe
// ─────────────────────────────────────────────────────────────────────────────

function DocumentsPanel({
  docs,
  signedUrls,
}: {
  docs: FallDetailDocument[]
  signedUrls: Record<string, string | null>
}) {
  const items: DokumentItem[] = docs.map((d) => ({
    id: d.id,
    name: d.original_filename ?? d.dokument_typ,
    url: signedUrls[d.id] ?? null,
    typ: d.dokument_typ,
    mimeType: d.mime_type,
    groesseBytes: d.groesse_bytes,
    createdAt: d.hochgeladen_am,
  }))
  return (
    <DokumenteDownloadListe
      variant="grid"
      rolle="makler"
      emptyTitle="Noch keine Dokumente"
      emptyDescription="Dokumente erscheinen hier, sobald Kunde oder SV sie hochladen."
      dokumente={items}
    />
  )
}

