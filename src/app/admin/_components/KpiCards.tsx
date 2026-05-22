import { createClient } from '@/lib/supabase/server'
import { UsersIcon, EuroIcon, FolderIcon, TrendingUpIcon, ClipboardCheckIcon, AlertCircleIcon } from 'lucide-react'
import { StatCard, type StatCardProps } from '@/components/shared/StatCard'

// KFZ-155: 4 KPI-Cards in einer Row.
//   - Aktive SVs (portal_zugang_freigeschaltet=true)
//   - Ausstehende Zahlungen Summe (offene Anzahlungen + ueberfaellige Rechnungen)
//   - Neue Faelle heute (created_at::date = today)
//   - Umsatz aktueller Monat (rechnungen.bezahlt_am im aktuellen Monat)

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function fmtNumber(n: number): string {
  return n.toLocaleString('de-DE')
}

async function loadKpis() {
  const supabase = await createClient()

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
  const monatStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monatEnde = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

  // AAR-928-Followup: 14d+ saeumige SV-Abrechnungen
  const grenzeSaeumig = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [
    aktiveSvs,
    offeneAnzahlungen,
    offeneRechnungen,
    neueFaelleHeute,
    umsatzMonat,
    pendingQc,
    saeumigeSvs,
  ] = await Promise.all([
    // AAR SV-Audit-Konsolidierung: gelöschte + gesperrte SVs raus aus KPI-Counts.
    // Vorher zählten soft-deleted + gesperrte SVs als „aktiv".
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
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart)
      .not('status', 'in', '("storniert")'),

    supabase
      .from('abrechnungen')
      .select('bezahlt_betrag, summe_brutto')
      .not('bezahlt_am', 'is', null)
      .gte('bezahlt_am', monatStart)
      .lte('bezahlt_am', monatEnde),

    // KFZ-204: Gutachten warten auf QC
    // CMM-44 SP-H PR2: filmcheck_ok lebt jetzt auf auftraege (aktueller Auftrag).
    // Statt des faelle-Filter-Praedikats die repointete View nutzen — sie
    // exponiert filmcheck_ok via LATERAL aus dem aktuellen Auftrag, das
    // .or()-Filter funktioniert unveraendert. Faelle ohne Auftrag liefern
    // filmcheck_ok=NULL (LEFT JOIN) -> .is.null matched -> weiterhin gezaehlt
    // (= "kein bestandener Filmcheck", semantisch identisch zur faelle-Query).
    supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'gutachten-eingegangen')
      .or('filmcheck_ok.is.null,filmcheck_ok.eq.false'),

    // AAR-928-Followup: 14d+ saeumige SV-Abrechnungen — Click-Through zu /saeumige-svs
    supabase
      .from('abrechnungen')
      .select('summe_brutto', { count: 'exact' })
      .eq('empfaenger_typ', 'sv')
      .is('bezahlt_am', null)
      .is('storniert_am', null)
      .not('faellig_am', 'is', null)
      .lte('faellig_am', grenzeSaeumig),
  ])

  const sumAnzahlungen = (offeneAnzahlungen.data ?? []).reduce(
    (s, r) => s + Number(r.onboarding_anzahlung_betrag ?? 0),
    0,
  )
  const sumRechnungen = (offeneRechnungen.data ?? []).reduce(
    (s, r) => s + Number(r.summe_brutto ?? 0),
    0,
  )
  const ausstehendGesamt = sumAnzahlungen + sumRechnungen

  const umsatz = (umsatzMonat.data ?? []).reduce(
    (s, r) => s + Number(r.bezahlt_betrag ?? r.summe_brutto ?? 0),
    0,
  )

  const sumSaeumig = (saeumigeSvs.data ?? []).reduce(
    (s, r) => s + Number(r.summe_brutto ?? 0),
    0,
  )

  return {
    aktiveSvs: aktiveSvs.count ?? 0,
    ausstehendGesamt,
    neueFaelleHeute: neueFaelleHeute.count ?? 0,
    umsatzMonat: umsatz,
    pendingQc: pendingQc.count ?? 0,
    saeumigeCount: saeumigeSvs.count ?? 0,
    saeumigeSumme: sumSaeumig,
  }
}

export default async function KpiCards() {
  const kpis = await loadKpis()

  // AAR-618: Jede Karte linkt auf die passende Seite. href zeigt auf den
  // Bereich wo der Admin die dahinterliegenden Datensätze weiterbearbeitet.
  const cards: StatCardProps[] = [
    {
      label: 'Aktive SVs',
      value: fmtNumber(kpis.aktiveSvs),
      icon: UsersIcon,
      tone: 'ondo',
      hint: 'Portal-Zugang freigeschaltet',
      href: '/admin/sachverstaendige',
    },
    {
      label: 'Ausstehende Zahlungen',
      value: fmtEur(kpis.ausstehendGesamt),
      icon: EuroIcon,
      tone: 'warning',
      hint: 'Anzahlungen + überfällige Rechnungen',
      href: '/admin/finance/abrechnungen',
    },
    {
      label: 'Neue Fälle heute',
      value: fmtNumber(kpis.neueFaelleHeute),
      icon: FolderIcon,
      tone: 'navy',
      hint: 'seit 0:00 Uhr',
      href: '/admin/faelle',
    },
    {
      label: 'Umsatz aktueller Monat',
      value: fmtEur(kpis.umsatzMonat),
      icon: TrendingUpIcon,
      tone: 'success',
      hint: 'bezahlte Rechnungen',
      href: '/admin/finance',
    },
    {
      label: 'Gutachten → QC',
      value: fmtNumber(kpis.pendingQc),
      icon: ClipboardCheckIcon,
      tone: kpis.pendingQc > 0 ? 'danger' : 'neutral',
      hint: 'warten auf Filmcheck',
      href: '/admin/faelle/statistiken',
    },
    // AAR-928-Followup: Säumige SVs (14d+) — fokussiert auf Mahnungs-Pipeline,
    // separat von "Ausstehende Zahlungen" das Anzahlungen + alle überfälligen
    // Rechnungen mischt.
    {
      label: 'Säumige SVs (14d+)',
      value: fmtNumber(kpis.saeumigeCount),
      icon: AlertCircleIcon,
      tone: kpis.saeumigeCount > 0 ? 'danger' : 'neutral',
      hint: kpis.saeumigeCount > 0 ? fmtEur(kpis.saeumigeSumme) + ' offen' : 'alle bezahlt',
      href: '/admin/finance/saeumige-svs',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  )
}
