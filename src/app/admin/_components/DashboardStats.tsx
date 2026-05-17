import { createClient } from '@/lib/supabase/server'
import { TrendingUpIcon, BarChart3Icon } from 'lucide-react'

// KFZ-155: Row 4 — kompakte Charts/Stats fuer das Dashboard.
//   - Lead-Konversion (letzte 30 Tage): Leads → Faelle Rate
//   - Umsatz-Verlauf 30 Tage Sparkline aus abrechnungen.bezahlt_am

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

async function loadStats() {
  const supabase = await createClient()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const sinceIso = since.toISOString()

  const [{ count: leadsTotal }, { count: faelleAusLeads }, { data: bezahlt }, { data: abgeschlossen }] = await Promise.all([
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sinceIso),

    supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sinceIso)
      .not('lead_id', 'is', null),

    supabase
      .from('abrechnungen')
      .select('summe_brutto, bezahlt_betrag, bezahlt_am')
      .not('bezahlt_am', 'is', null)
      .gte('bezahlt_am', sinceIso)
      .order('bezahlt_am', { ascending: true }),

    // CMM-44 SP-A2 (Cluster 3): regulierung_betrag → claims.regulierungs_betrag (SSoT) via Embed.
    supabase
      .from('faelle')
      .select('id, regulierung_am, claims:claim_id(regulierungs_betrag)')
      .eq('status', 'abgeschlossen')
      .gte('regulierung_am', sinceIso)
      .order('regulierung_am', { ascending: true }),
  ])

  const leads = leadsTotal ?? 0
  const faelle = faelleAusLeads ?? 0
  const konversionPct = leads > 0 ? Math.round((faelle / leads) * 100) : 0

  // 30 Tage Bins fuer Sparkline (faktisch bezahlte Rechnungen + abgeschlossene Faelle)
  const dayUmsatz = new Array(30).fill(0) as number[]
  for (const r of bezahlt ?? []) {
    if (!r.bezahlt_am) continue
    const idx = 29 - Math.floor((Date.now() - new Date(r.bezahlt_am).getTime()) / 86400000)
    if (idx >= 0 && idx < 30) {
      dayUmsatz[idx] += Number(r.bezahlt_betrag ?? r.summe_brutto ?? 0)
    }
  }
  for (const r of abgeschlossen ?? []) {
    if (!r.regulierung_am) continue
    const idx = 29 - Math.floor((Date.now() - new Date(r.regulierung_am).getTime()) / 86400000)
    if (idx >= 0 && idx < 30) {
      const c = Array.isArray(r.claims) ? r.claims[0] : r.claims
      dayUmsatz[idx] += Number(c?.regulierungs_betrag ?? 0)
    }
  }
  const umsatzTotal = dayUmsatz.reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...dayUmsatz)

  return { leads, faelle, konversionPct, dayUmsatz, umsatzTotal, max }
}

export default async function DashboardStats() {
  const s = await loadStats()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-full">
      {/* Lead-Konversion */}
      <div className="bg-white rounded-ios-lg shadow-ios-md p-5 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3Icon className="w-4 h-4 text-claimondo-ondo" />
            <h3 className="text-sm font-semibold text-claimondo-navy">Lead-Konversion (30 Tage)</h3>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-around">
          <div className="text-center">
            <p className="text-[10px] text-claimondo-ondo uppercase">Leads</p>
            <p className="text-3xl font-bold text-claimondo-navy tabular-nums">{s.leads}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-claimondo-ondo uppercase">Faelle</p>
            <p className="text-3xl font-bold text-claimondo-navy tabular-nums">{s.faelle}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-claimondo-ondo uppercase">Konversion</p>
            <p className="text-3xl font-bold text-emerald-600 tabular-nums">{s.konversionPct}%</p>
          </div>
        </div>
        <div className="mt-3 h-2 bg-claimondo-bg rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-claimondo-ondo to-emerald-500 transition-all"
            style={{ width: `${Math.min(100, s.konversionPct)}%` }}
          />
        </div>
      </div>

      {/* Umsatz-Sparkline */}
      <div className="bg-white rounded-ios-lg shadow-ios-md p-5 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUpIcon className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-claimondo-navy">Umsatz-Verlauf (30 Tage)</h3>
          </div>
          <span className="text-sm font-bold text-emerald-600 tabular-nums">{fmtEur(s.umsatzTotal)}</span>
        </div>
        <div className="flex-1 flex items-end gap-0.5">
          {s.dayUmsatz.map((v, i) => {
            const h = Math.max(2, (v / s.max) * 100)
            return (
              <div
                key={i}
                className="flex-1 bg-emerald-500/30 hover:bg-emerald-500/60 transition-colors rounded-ios-sm"
                style={{ height: `${h}%` }}
                title={fmtEur(v)}
              />
            )
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-claimondo-ondo/70">
          <span>vor 30 Tagen</span>
          <span>heute</span>
        </div>
      </div>
    </div>
  )
}
