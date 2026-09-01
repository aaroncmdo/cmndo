import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UsersIcon, EuroIcon, FolderIcon, TrendingUpIcon, ClipboardCheckIcon, AlertCircleIcon } from 'lucide-react'
import { StatBar, type StatBarItem } from '@/components/shared/StatBar'
import KritischeUpdatesWidget from './_components/KritischeUpdatesWidget'
import AusstehendeZahlungenWidget from './_components/AusstehendeZahlungenWidget'
import WichtigeUpdatesWidget from './_components/WichtigeUpdatesWidget'
import DashboardStats from './_components/DashboardStats'
import TageskalenderWidget from './_components/TageskalenderWidget'
import HaengendeFaelleWidget from './_components/HaengendeFaelleWidget'
import TermineIntegritaetWidget from './_components/TermineIntegritaetWidget'
import ReparaturWorkstateWidget from './_components/ReparaturWorkstateWidget'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
// P4c (E1): Der Ops-Cockpit (getOpsRollup/getMyClaimWorkItems/AdminOpsCockpit) ist
// nach /admin/faelle (Fälle-Hub-Landing) gewandert — /admin ist jetzt das
// Finanz-/Betriebs-Dashboard, keine Case-Arbeitsfläche mehr.

// KFZ-155 -> Redesign 07/2026 ("Der Tag auf einen Blick"): PageHeader -> Greeting +
// Dringlichkeits-Zeile; die 6 KpiCards (StatCard-Grid) -> verbundene StatBar. loadKpis
// ist hierher gezogen (KpiCards.tsx retired), damit Greeting-Dringlichkeitszeile UND
// StatBar dieselbe Fetch teilen (wie das KB-Dashboard top-level fetcht). Content-Widgets
// (Kritische/Wichtige Updates, Tageskalender, Zahlungen, Charts) unveraendert +
// Suspense-gestreamt. Datenschicht 1:1 (Queries verbatim aus KpiCards).

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}
function fmtNumber(n: number): string {
  return n.toLocaleString('de-DE')
}

async function loadKpis() {
  const supabase = await createClient()

  const now = new Date()
  // FIX (Dashboard-Metrik-Audit 06.07.): echte Berlin-Tagesgrenze fuer "neue Faelle heute"
  // (new Date(y,m,d) = Server-lokal = UTC auf Vercel -> am Tagesrand 1-2h schief).
  const berlinDateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const todayStart = new Date(berlinWallClockToUtc(`${berlinDateStr}T00:00:00`)).toISOString()
  const monatStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monatEnde = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

  // AAR-928-Followup: 14d+ saeumige SV-Abrechnungen
  const grenzeSaeumig = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // CMM-49 P1: "Neue Faelle heute" direkt aus claims (SSoT).
  const [aktiveSvs, offeneAnzahlungen, offeneRechnungen, neueFaelleHeute, umsatzMonat, pendingQc, saeumigeSvs] =
    await Promise.all([
      // gelöschte + gesperrte SVs raus aus KPI-Counts.
      supabase
        .from('sachverstaendige')
        .select('id', { count: 'exact', head: true })
        .eq('portal_zugang_freigeschaltet', true)
        .is('gesperrt_seit', null)
        .is('geloescht_am', null),
      supabase
        .from('sachverstaendige')
        .select('onboarding_anzahlung_betrag')
        .eq('vertrag_unterschrieben', true)
        .eq('portal_zugang_freigeschaltet', false)
        .is('geloescht_am', null)
        .gt('onboarding_anzahlung_betrag', 0),
      supabase
        .from('abrechnungen')
        .select('summe_brutto')
        .is('bezahlt_am', null)
        .is('storniert_am', null)
        .lt('faellig_am', new Date().toISOString().slice(0, 10)),
      supabase
        .from('claims')
        .select('id', { count: 'exact', head: true })
        .not('operative_status', 'in', '("storniert")')
        .gte('created_at', todayStart),
      supabase
        .from('abrechnungen')
        .select('bezahlt_betrag, summe_brutto')
        .not('bezahlt_am', 'is', null)
        .gte('bezahlt_am', monatStart)
        .lte('bezahlt_am', monatEnde),
      // KFZ-204: Gutachten warten auf QC (v_faelle_mit_aktuellem_termin exponiert filmcheck_ok)
      supabase
        .from('v_faelle_mit_aktuellem_termin')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'gutachten-eingegangen')
        .or('filmcheck_ok.is.null,filmcheck_ok.eq.false'),
      // AAR-928-Followup: 14d+ saeumige SV-Abrechnungen
      supabase
        .from('abrechnungen')
        .select('summe_brutto', { count: 'exact' })
        .eq('empfaenger_typ', 'sv')
        .is('bezahlt_am', null)
        .is('storniert_am', null)
        .not('faellig_am', 'is', null)
        .lte('faellig_am', grenzeSaeumig),
    ])

  const sumAnzahlungen = (offeneAnzahlungen.data ?? []).reduce((s, r) => s + Number(r.onboarding_anzahlung_betrag ?? 0), 0)
  const sumRechnungen = (offeneRechnungen.data ?? []).reduce((s, r) => s + Number(r.summe_brutto ?? 0), 0)
  const umsatz = (umsatzMonat.data ?? []).reduce((s, r) => s + Number(r.bezahlt_betrag ?? r.summe_brutto ?? 0), 0)
  const sumSaeumig = (saeumigeSvs.data ?? []).reduce((s, r) => s + Number(r.summe_brutto ?? 0), 0)

  return {
    aktiveSvs: aktiveSvs.count ?? 0,
    ausstehendGesamt: sumAnzahlungen + sumRechnungen,
    neueFaelleHeute: neueFaelleHeute.count ?? 0,
    umsatzMonat: umsatz,
    pendingQc: pendingQc.count ?? 0,
    saeumigeCount: saeumigeSvs.count ?? 0,
    saeumigeSumme: sumSaeumig,
  }
}

function WidgetSkeleton({ height = 'h-48' }: { height?: string }) {
  return <LoadingSkeleton variant="block" height={height} />
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const [{ data: profile }, kpis] = await Promise.all([
    supabase.from('profiles').select('vorname').eq('id', user.id).maybeSingle(),
    loadKpis(),
  ])
  const vorname = (profile?.vorname as string | null) ?? null
  const dateStr = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' })

  // Dringlichkeits-Zeile — nur Handlungs-Bedarf; ueberfaellig/kritisch in danger.
  const seg: { t: string; danger?: boolean }[] = []
  if (kpis.pendingQc) seg.push({ t: `${kpis.pendingQc} Gutachten → QC`, danger: true })
  if (kpis.saeumigeCount) seg.push({ t: `${kpis.saeumigeCount} ${kpis.saeumigeCount === 1 ? 'säumiger SV' : 'säumige SVs'}`, danger: true })
  if (kpis.neueFaelleHeute) seg.push({ t: `${kpis.neueFaelleHeute} ${kpis.neueFaelleHeute === 1 ? 'neuer Fall' : 'neue Fälle'} heute` })
  if (kpis.ausstehendGesamt > 0) seg.push({ t: `${fmtEur(kpis.ausstehendGesamt)} ausstehend` })

  const stats: StatBarItem[] = [
    { label: 'Aktive SVs', value: fmtNumber(kpis.aktiveSvs), icon: UsersIcon, href: '/admin/sachverstaendige' },
    { label: 'Ausstehend', value: fmtEur(kpis.ausstehendGesamt), icon: EuroIcon, href: '/admin/finance/abrechnungen', tone: kpis.ausstehendGesamt > 0 ? 'warning' : 'default' },
    { label: 'Fälle heute', value: fmtNumber(kpis.neueFaelleHeute), icon: FolderIcon, href: '/admin/faelle' },
    { label: 'Umsatz Monat', value: fmtEur(kpis.umsatzMonat), icon: TrendingUpIcon, href: '/admin/finance', tone: 'success' },
    { label: 'Gutachten QC', value: fmtNumber(kpis.pendingQc), icon: ClipboardCheckIcon, href: '/admin/faelle/statistiken', tone: kpis.pendingQc > 0 ? 'danger' : 'default' },
    { label: 'Säumige SVs', value: fmtNumber(kpis.saeumigeCount), icon: AlertCircleIcon, href: '/admin/finance/saeumige-svs', tone: kpis.saeumigeCount > 0 ? 'danger' : 'default' },
  ]

  return (
    <div className="h-full overflow-y-auto bg-claimondo-bg">
      <div className="py-5 space-y-5">
        {/* Greeting + Dringlichkeits-Zeile */}
        <div>
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
            <h1 className="text-heading-lg font-bold text-claimondo-navy">
              Guten Tag{vorname ? `, ${vorname}` : ''}
            </h1>
            <p className="text-body-sm font-medium capitalize text-claimondo-ondo">{dateStr}</p>
          </div>
          <p className="mt-1 text-body-sm text-claimondo-ondo">
            {seg.length ? (
              seg.map((s, i) => (
                <span key={i}>
                  {i > 0 ? <span className="text-claimondo-ondo/50"> · </span> : null}
                  <span className={s.danger ? 'font-semibold text-danger-strong' : undefined}>{s.t}</span>
                </span>
              ))
            ) : (
              'Alles im grünen Bereich — nichts Dringendes.'
            )}
          </p>
        </div>

        {/* P4c (E1): Der Ops-Cockpit (Claim-Workflow) lebt jetzt auf /admin/faelle.
            /admin = Finanz-/Betriebs-Dashboard (Metrik-Leiste + Widgets unten). */}
        <h2 className="text-heading-sm font-bold text-claimondo-navy">
          Finanzen &amp; Betrieb
        </h2>

        {/* Metrik-Leiste (ex 6 KpiCards) */}
        <StatBar items={stats} />

        {/* Kritische Updates (conditional, voll-breit) */}
        <Suspense fallback={<WidgetSkeleton height="h-20" />}>
          <KritischeUpdatesWidget />
        </Suspense>

        {/* Fälle ohne Bewegung — bewusst weit oben: hier warten echte Kunden.
            Der Hänger-Detektor meldete seit dem 13.08. korrekt, seine Meldungen lagen
            aber unbeachtet in /admin/aufgaben/alle (Messung 01.09.: manuelle Abarbeitung
            findet dort praktisch nicht statt). Dieselbe Information, sichtbarer Ort. */}
        <Suspense fallback={<WidgetSkeleton height="h-48" />}>
          <HaengendeFaelleWidget />
        </Suspense>

        {/* Tageskalender */}
        <Suspense fallback={<WidgetSkeleton height="h-48" />}>
          <TageskalenderWidget />
        </Suspense>

        {/* Termine-Integritaets-Monitor — on-demand (kein Server-Fetch beim Render) */}
        <TermineIntegritaetWidget />

        {/* Reparatur-Workstate-Monitor — on-demand (WS6 Slice 2, kein Server-Fetch beim Render) */}
        <ReparaturWorkstateWidget />

        {/* Ausstehende Zahlungen + Wichtige Updates (split) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Suspense fallback={<WidgetSkeleton height="h-64" />}>
            <AusstehendeZahlungenWidget />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton height="h-64" />}>
            <WichtigeUpdatesWidget />
          </Suspense>
        </div>

        {/* Charts/Stats — unveraendert */}
        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <WidgetSkeleton height="h-48" />
              <WidgetSkeleton height="h-48" />
            </div>
          }
        >
          <DashboardStats />
        </Suspense>
      </div>
    </div>
  )
}
