import { createClient } from '@/lib/supabase/server'
import { UsersIcon, EuroIcon, FolderIcon, TrendingUpIcon } from 'lucide-react'

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

  const [
    aktiveSvs,
    offeneAnzahlungen,
    offeneRechnungen,
    neueFaelleHeute,
    umsatzMonat,
  ] = await Promise.all([
    supabase
      .from('sachverstaendige')
      .select('id', { count: 'exact', head: true })
      .eq('portal_zugang_freigeschaltet', true),

    supabase
      .from('sachverstaendige')
      .select('onboarding_anzahlung_betrag')
      .eq('vertrag_unterschrieben', true)
      .eq('portal_zugang_freigeschaltet', false)
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
      .gte('created_at', todayStart),

    supabase
      .from('abrechnungen')
      .select('bezahlt_betrag, summe_brutto')
      .not('bezahlt_am', 'is', null)
      .gte('bezahlt_am', monatStart)
      .lte('bezahlt_am', monatEnde),
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

  return {
    aktiveSvs: aktiveSvs.count ?? 0,
    ausstehendGesamt,
    neueFaelleHeute: neueFaelleHeute.count ?? 0,
    umsatzMonat: umsatz,
  }
}

export default async function KpiCards() {
  const kpis = await loadKpis()

  const cards = [
    {
      label: 'Aktive SVs',
      value: fmtNumber(kpis.aktiveSvs),
      icon: UsersIcon,
      bg: 'bg-[#4573A2]/10',
      iconColor: 'text-[#4573A2]',
      hint: 'Portal-Zugang freigeschaltet',
    },
    {
      label: 'Ausstehende Zahlungen',
      value: fmtEur(kpis.ausstehendGesamt),
      icon: EuroIcon,
      bg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      hint: 'Anzahlungen + ueberfaellige Rechnungen',
    },
    {
      label: 'Neue Faelle heute',
      value: fmtNumber(kpis.neueFaelleHeute),
      icon: FolderIcon,
      bg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      hint: 'seit 0:00 Uhr',
    },
    {
      label: 'Umsatz aktueller Monat',
      value: fmtEur(kpis.umsatzMonat),
      icon: TrendingUpIcon,
      bg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      hint: 'bezahlte Rechnungen',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(c => {
        const Icon = c.icon
        return (
          <div key={c.label} className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{c.label}</p>
              <div className={`w-7 h-7 rounded-full ${c.bg} flex items-center justify-center`}>
                <Icon className={`w-3.5 h-3.5 ${c.iconColor}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{c.value}</p>
            <p className="text-[10px] text-gray-400 mt-1">{c.hint}</p>
          </div>
        )
      })}
    </div>
  )
}
