import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TargetIcon } from 'lucide-react'

// KFZ-155: Werbebudget-Verbrauch Aggregat — gesamt + top 10 SVs.
//
// sachverstaendige.werbebudget_guthaben_netto haelt das aktuelle
// verbleibende Guthaben pro SV. Wir aggregieren das Gesamt-Guthaben
// und listen die Top 10 SVs mit dem hoechsten verbleibenden Guthaben.

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

async function loadWerbebudget() {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, werbebudget_guthaben_netto, ist_aktiv')
    .not('werbebudget_guthaben_netto', 'is', null)

  const aktive = (rows ?? []).filter(r => r.ist_aktiv !== false)

  const gesamt = aktive.reduce((s, r) => s + Number(r.werbebudget_guthaben_netto ?? 0), 0)
  const aktiveAnzahl = aktive.length
  const mitBudget = aktive.filter(r => Number(r.werbebudget_guthaben_netto ?? 0) > 0).length

  const sorted = [...aktive].sort(
    (a, b) => Number(b.werbebudget_guthaben_netto ?? 0) - Number(a.werbebudget_guthaben_netto ?? 0),
  )
  const top10 = sorted.slice(0, 10)

  const profileIds = top10.map(r => r.profile_id).filter(Boolean) as string[]
  let nameMap = new Map<string, string>()
  if (profileIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, vorname, nachname')
      .in('id', profileIds)
    nameMap = new Map(
      (profs ?? []).map(p => [p.id, `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || '—']),
    )
  }

  const top10Rows = top10.map(r => ({
    id: r.id,
    name: r.profile_id ? nameMap.get(r.profile_id) ?? '—' : '—',
    betrag: Number(r.werbebudget_guthaben_netto ?? 0),
  }))

  return { gesamt, aktiveAnzahl, mitBudget, top10Rows }
}

export default async function WerbebudgetAggregatWidget() {
  const data = await loadWerbebudget()
  const max = Math.max(1, ...data.top10Rows.map(r => r.betrag))

  return (
    <div className="pb-8">
      <div className="">
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TargetIcon className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Werbebudget-Verbrauch
              </h2>
            </div>
            <span className="text-[11px] text-gray-500">
              {data.mitBudget} von {data.aktiveAnzahl} aktiven SVs
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <p className="text-gray-500 text-xs mb-1">Gesamt-Guthaben</p>
              <p className="text-emerald-600 text-2xl font-bold tabular-nums">{fmtEur(data.gesamt)}</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <p className="text-gray-500 text-xs mb-1">SVs mit Budget</p>
              <p className="text-gray-900 text-2xl font-bold tabular-nums">{data.mitBudget}</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <p className="text-gray-500 text-xs mb-1">Durchschnitt</p>
              <p className="text-gray-900 text-2xl font-bold tabular-nums">
                {fmtEur(data.mitBudget > 0 ? data.gesamt / data.mitBudget : 0)}
              </p>
            </div>
          </div>

          {data.top10Rows.length > 0 ? (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-3">
                Top 10 SVs nach Guthaben
              </p>
              <div className="space-y-1.5">
                {data.top10Rows.map((r, idx) => {
                  const barWidth = max > 0 ? (r.betrag / max) * 100 : 0
                  return (
                    <Link
                      key={r.id}
                      href={`/admin/sachverstaendige/${r.id}`}
                      className="block hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-700 font-medium truncate flex items-center gap-2">
                          <span className="text-gray-400 tabular-nums w-5 text-right">{idx + 1}.</span>
                          {r.name}
                        </span>
                        <span className="text-emerald-600 font-semibold tabular-nums">{fmtEur(r.betrag)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 text-center py-4">
              Keine SVs mit Werbebudget-Guthaben.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
