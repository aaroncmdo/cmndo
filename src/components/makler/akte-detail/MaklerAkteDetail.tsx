'use client'

// AAR-487 (M5): Makler-Akte-Detail — Header, Quick-Stats und vier Tab-Panels.
//
// C4/§9-#7 (Fundament „Eine Akte", 13.08.): Die Sicht haengt jetzt am gemeinsamen
// `<FallAkte layout='tabs'>`-Kern statt an einer eigenen Shell. Tab-Bar, Tab-State und der
// `?tab=`-URL-Sync kommen von dort — die lokale TabButton-Leiste samt `selectTab`,
// `useState`, `useRouter` und `useSearchParams` ist dadurch ersatzlos entfallen.
// Vorbild ist der Staff-Consumer `app/faelle/[id]/FallakteShell.tsx`.

import { useMemo, type ReactNode } from 'react'
import Link from 'next/link'
// C4-Kern („Eine Akte") — rollen-parametrisiert, hier im Tabs-Modus.
import { FallAkte } from '@/components/fall-akte/FallAkte'
import type { FallAkteConfig } from '@/components/fall-akte/types'
import type { FallakteTabDef } from '@/components/shared/fall-tabs'
import {
  ArrowLeftIcon,
  PhoneIcon,
  EuroIcon,
  ShieldCheckIcon,
  CalendarIcon,
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
  TimelineEvent,
  MaklerRow,
  MaklerChatMessage,
} from '@/lib/makler/queries'
// CMM-44 MP-4e: abgeleitete 4-Phase + Substate-Label (statt claims.phase/status).
import { MAIN_PHASE_LABEL, SUBPHASE_LABEL } from '@/lib/claims/lifecycle'
import { MaklerChatTab } from './MaklerChatTab'
import { MaklerCopilotTab } from './MaklerCopilotTab'
import { SectionCard } from '@/components/shared/SectionCard'
import EmptyState from '@/components/shared/EmptyState'
// AAR-754: shared Ansprechpartner-Karte (KB/SV/Kanzlei) — rolle="makler".
import { FallKontakteCard } from '@/components/shared/fall-kontakte'
// AAR-489 F4: Consent-Scope -> Label + Farb-Token + Vollzugriff-Check (geteilt).
import {
  istVollzugriff,
  consentScopeLabel,
  consentScopeValueClass,
} from '@/lib/makler/consent-display'

// `initialTab` ist mit der C4-Migration entfallen: den aktiven Tab liest der Kern selbst
// aus `?tab=` (und faellt auf den ersten zurueck, wenn der Wert unbekannt ist). Ein
// server-durchgereichter Startwert waere ab jetzt eine zweite Wahrheit.
type Props = {
  detail: FallDetail
  makler: MaklerRow
  currentUserId: string
  initialChatMessages: MaklerChatMessage[]
  gruppeThreadId: string | null
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
  currentUserId,
  initialChatMessages,
  gruppeThreadId,
}: Props) {
  const copilotVerfuegbar = istVollzugriff(detail.consent_scope)
  // Copilot arbeitet nur bei Vollzugriff (API 403t sonst). Der Tab wird deshalb gar nicht
  // erst angeboten — der Kern faellt bei einem Deep-Link `?tab=copilot` automatisch auf den
  // ersten Tab zurueck (`tabs.some(t => t.id === tabParam) ? tabParam : firstId`), was die
  // bisherige Sonderbehandlung von `initialTab` ueberfluessig macht.
  const { fall, kunde, provision, timeline } = detail

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

  // C4/§9-#7 („Eine Akte", Fundament): die Makler-Detailsicht haengt jetzt am gemeinsamen
  // Kern statt an einer eigenen Shell. Uebernommen hat er Tab-Bar, Tab-State und den
  // `?tab=`-URL-Sync — die lokale `TabButton`-Leiste samt `selectTab`/`useState` entfaellt
  // dadurch ersatzlos. Header, Kennzahlen und die vier Panels bleiben INHALTLICH
  // unveraendert; sie wandern nur in die Config-Slots.
  //
  // ⚠ Einzige bewusste Verhaltensaenderung: der Kern schreibt `?tab=overview` explizit in
  // die URL, wo die alte Shell den Parameter fuer die Uebersicht entfernte. Deep-Links
  // bleiben kompatibel (fehlender Parameter => erster Tab), nur die URL ist eine Spur
  // gespraechiger.
  const header = (
    <>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-claimondo-ondo mb-4">
        <Link href="/makler/akten" className="inline-flex items-center gap-1 hover:text-claimondo-navy">
          <ArrowLeftIcon width={12} height={12} /> Meine Akten
        </Link>
        <span aria-hidden>/</span>
        <span className="text-claimondo-navy font-mono">
          {fall.claim_nummer ?? fall.id.slice(0, 8)}
        </span>
      </nav>

      {/* Header-Card */}
      <header className="relative rounded-ios-md overflow-hidden bg-gradient-to-br from-claimondo-navy via-claimondo-shield to-claimondo-navy p-6 md:p-8 text-white">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{fullName(kunde)}</h1>
            <p className="text-sm text-claimondo-shield mt-1 truncate">
              <span className="font-mono">
                {fall.claim_nummer ?? fall.id.slice(0, 8)}
              </span>
              {' · '}
              {[fall.fahrzeug_hersteller, fall.fahrzeug_modell]
                .filter(Boolean)
                .join(' ') || 'Fahrzeug unbekannt'}
              {fall.unfalldatum ? ` · Unfall ${fmtDate(fall.unfalldatum)}` : ''}
            </p>
            <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white">
              {MAIN_PHASE_LABEL[fall.mainPhase]} · {SUBPHASE_LABEL[fall.subPhase]}
            </div>
          </div>
          {kunde?.telefon ? (
            <a
              href={`tel:${kunde.telefon}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-ios-lg bg-white text-claimondo-navy text-sm font-semibold hover:bg-claimondo-light-blue/20"
            >
              <PhoneIcon width={16} height={16} />
              Kunde anrufen
            </a>
          ) : null}
        </div>
      </header>
    </>
  )

  // Quick-Stats — laufen als topBlocks-Slot volle Breite unter dem Header.
  const kennzahlen = (
      <section
        aria-label="Kennzahlen"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6"
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
          value={consentScopeLabel(detail.consent_scope)}
          icon={<ShieldCheckIcon width={16} height={16} />}
          valueClass={consentScopeValueClass(detail.consent_scope)}
        />
        <QuickStat
          label="Fall seit"
          value={`${daysSince(fall.created_at)} Tagen`}
          icon={<CalendarIcon width={16} height={16} />}
        />
      </section>
  )

  // Tab-Definitionen: der Copilot-Eintrag entsteht nur bei Vollzugriff — dadurch braucht
  // es keine Sonderbehandlung mehr fuer den Deep-Link `?tab=copilot`.
  const tabs: FallakteTabDef[] = [
    { id: 'overview', label: 'Übersicht', icon: LayoutListIcon },
    { id: 'timeline', label: 'Timeline', icon: CalendarIcon },
    { id: 'chat', label: 'Chat', icon: MessageSquareIcon },
    ...(copilotVerfuegbar ? [{ id: 'copilot', label: 'Copilot', icon: SparklesIcon }] : []),
  ]

  // Panels VORGERENDERT (Kern-Contract: heterogene Props je Tab -> tabContent statt zones).
  // Inhaltlich identisch zur bisherigen Fassung.
  const tabContent: Record<string, ReactNode> = {
    overview: <OverviewPanel detail={detail} gesamtforderung={gesamtforderung} />,
    timeline: <TimelinePanel events={timeline} />,
    chat: (
      <div className="space-y-4">
        <MaklerKontakte kontakte={detail.kontakte} />
        <MaklerChatTab
          fallId={fall.id}
          currentUserId={currentUserId}
          initialMessages={initialChatMessages}
          gruppeThreadId={gruppeThreadId}
        />
      </div>
    ),
    ...(copilotVerfuegbar
      ? {
          copilot: (
            <MaklerCopilotTab
              fallId={fall.id}
              gegnerVsName={fall.gegner_versicherung}
              kontextLoaded={copilotVerfuegbar}
            />
          ),
        }
      : {}),
  }

  const config: FallAkteConfig<FallDetail, never> = {
    layout: 'tabs',
    // Bei layout='tabs' rendert der Kern ausschliesslich den aktiven Tab — die
    // Zonen-Maschinerie bleibt leer (identisch zum Staff-Consumer).
    zones: () => [],
    zoneComponents: {},
    wrapperClassName: 'max-w-6xl mx-auto px-4 sm:px-6 py-6',
    header: () => ({ custom: header }),
    slots: () => ({ topBlocks: kennzahlen }),
    tabs,
    tabContent,
  }

  return <FallAkte config={config} vm={detail} />
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
    <div className="bg-white rounded-ios-xl border border-claimondo-border p-4">
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

// (TabButton entfernt — die Tab-Leiste kommt seit der C4-Migration aus dem Kern.)

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
    fall.nutzungsausfall_gesamt !== null ||
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
            <InfoRow label="Wertminderung" value={fmtEur(fall.wertminderung)} />
            <InfoRow
              label="Nutzungsausfall"
              value={fmtEur(fall.nutzungsausfall_gesamt)}
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
  // CMM-49 T1.2 (CMM-71): Next-Step-Copy aus abgeleiteter sub_phase (v_claim_phase) statt faelle.status.
  const copy: Record<string, string> = {
    sa_offen: 'SA-Unterschrift wird eingeholt.',
    vollmacht_offen: 'Vollmacht wird eingeholt.',
    onboarding_offen: 'Kunde im Onboarding — letzte Angaben ausstehend.',
    termin: `SV-Termin${fall.sv_termin ? ` am ${fmtDate(fall.sv_termin)}` : ' wird vereinbart'}.`,
    besichtigung: 'Besichtigung läuft.',
    gutachten: 'Gutachten wird erstellt.',
    kanzlei_uebergabe: 'An Kanzlei übergeben — Anschlussschreiben folgt.',
    versicherungskontakt: 'Kanzlei klärt mit der Versicherung.',
    auszahlung: 'Auszahlung wird vorbereitet.',
    nachforderung: 'VS-Ablehnung — Nachforderung läuft.',
    erfolgreich_reguliert: 'Fall erfolgreich reguliert.',
    storniert: 'Fall storniert.',
    klage_rechtsstreit: 'An die Klage übergeben.',
    verjaehrt: 'Fall verjährt.',
    abgelehnt_final: 'Versicherung hat final abgelehnt.',
    an_externe_kanzlei: 'An externe Kanzlei übergeben.',
    termin_durchgefuehrt: 'Termin durchgeführt.',
  }
  const text = copy[fall.subPhase] ?? SUBPHASE_LABEL[fall.subPhase] ?? ''
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
                  className="text-success bg-white"
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
// Ansprechpartner-Karte (oben im Chat-Tab) — shared FallKontakteCard, rolle="makler".
// Leerer Zustand: dezenter Hinweis statt Luecke.
// ─────────────────────────────────────────────────────────────────────────────

function MaklerKontakte({ kontakte }: { kontakte: FallDetail['kontakte'] }) {
  const hasAny = !!(kontakte.kundenbetreuer || kontakte.sv || kontakte.kanzlei)
  if (!hasAny) {
    // Shared SectionCard statt handgerolltem Card-Div (component-set-Ratchet).
    return (
      <SectionCard title="Ansprechpartner">
        <p className="text-sm text-claimondo-ondo">
          Ansprechpartner werden zugewiesen, sobald Betreuer oder Gutachter feststehen.
        </p>
      </SectionCard>
    )
  }
  return (
    <FallKontakteCard
      rolle="makler"
      kundenbetreuer={kontakte.kundenbetreuer}
      sv={kontakte.sv}
      kanzlei={kontakte.kanzlei}
    />
  )
}

