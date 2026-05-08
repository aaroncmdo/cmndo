import { createClient } from '@/lib/supabase/server'
import { BarChart3Icon } from 'lucide-react'

// KFZ-155: Lead-Preise Verteilung — wieviel Umsatz pro Lead-Preis-Kategorie.
//
// Aus gutachter_abrechnungen aggregiert:
//   - preistyp ('paket' / 'einzel') × leadpreis (numerisch)
// Wir bucketen die leadpreise (z.B. <100, 100-200, 200-400, 400+).

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

type Bucket = { label: string; min: number; max: number; anzahl: number; summe: number }

const BUCKETS: Omit<Bucket, 'anzahl' | 'summe'>[] = [
  { label: 'unter 100 EUR', min: 0, max: 100 },
  { label: '100 - 200 EUR', min: 100, max: 200 },
  { label: '200 - 400 EUR', min: 200, max: 400 },
  { label: 'ueber 400 EUR', min: 400, max: Infinity },
]

async function loadVerteilung() {
  const supabase = await createClient()
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: rows } = await supabase
    .from('gutachter_abrechnungen')
    .select('leadpreis, preistyp, abgerechnet_am')
    .gte('abgerechnet_am', ninetyDaysAgo)

  const buckets: Bucket[] = BUCKETS.map(b => ({ ...b, anzahl: 0, summe: 0 }))
  const typBreakdown: Record<string, { anzahl: number; summe: number }> = {}
  let total = 0

  for (const r of rows ?? []) {
    const preis = Number(r.leadpreis ?? 0)
    if (!preis) continue
    total += preis
    const typ = r.preistyp || 'unbekannt'
    typBreakdown[typ] = typBreakdown[typ] ?? { anzahl: 0, summe: 0 }
    typBreakdown[typ].anzahl++
    typBreakdown[typ].summe += preis

    const b = buckets.find(b => preis >= b.min && preis < b.max)
    if (b) {
      b.anzahl++
      b.summe += preis
    }
  }

  return { buckets, typBreakdown, total, count: (rows ?? []).length }
}

export default async function LeadPreiseVerteilungWidget() {
  const data = await loadVerteilung()
  const maxBucket = Math.max(1, ...data.buckets.map(b => b.summe))

  return (
    <div className="pb-8">
      <div className="bg-white rounded-ios-lg shadow-ios-md p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3Icon className="w-4 h-4 text-[#4573A2]" />
              <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider">
                Lead-Preise Verteilung
              </h2>
            </div>
            <span className="text-[11px] text-claimondo-ondo">
              {data.count} Leads · letzte 90 Tage · Umsatz {fmtEur(data.total)}
            </span>
          </div>

          {data.count === 0 ? (
            <p className="text-xs text-claimondo-ondo text-center py-6">
              Keine abgerechneten Leads in den letzten 90 Tagen.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bucket-Verteilung */}
              <div>
                <p className="text-[10px] text-claimondo-ondo uppercase tracking-wide font-semibold mb-3">
                  Nach Preis-Bucket
                </p>
                <div className="space-y-2">
                  {data.buckets.map(b => {
                    const pct = data.total > 0 ? (b.summe / data.total) * 100 : 0
                    const barWidth = data.total > 0 ? (b.summe / maxBucket) * 100 : 0
                    return (
                      <div key={b.label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-claimondo-navy font-medium">{b.label}</span>
                          <span className="text-claimondo-ondo tabular-nums">
                            {b.anzahl} · {fmtEur(b.summe)} · {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 bg-[#f8f9fb] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#4573A2] to-emerald-500 transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Nach Preis-Typ */}
              <div>
                <p className="text-[10px] text-claimondo-ondo uppercase tracking-wide font-semibold mb-3">
                  Nach Preis-Typ
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-claimondo-border">
                      <th className="text-left py-2 text-claimondo-ondo font-medium">Typ</th>
                      <th className="text-right py-2 text-claimondo-ondo font-medium">Anzahl</th>
                      <th className="text-right py-2 text-claimondo-ondo font-medium">Summe</th>
                      <th className="text-right py-2 text-claimondo-ondo font-medium">Anteil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.typBreakdown).map(([typ, v]) => {
                      const pct = data.total > 0 ? (v.summe / data.total) * 100 : 0
                      return (
                        <tr key={typ} className="border-b border-claimondo-border">
                          <td className="py-2 text-claimondo-navy capitalize">{typ}</td>
                          <td className="py-2 text-right text-claimondo-navy tabular-nums">{v.anzahl}</td>
                          <td className="py-2 text-right text-claimondo-navy font-medium tabular-nums">{fmtEur(v.summe)}</td>
                          <td className="py-2 text-right text-claimondo-ondo tabular-nums">{pct.toFixed(0)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
