'use client'

import { BarChart3Icon, BriefcaseIcon, TrophyIcon, GiftIcon, ClockIcon } from 'lucide-react'

type Perf = { monat: string; jahr: number; leads_qualifiziert: number; leads_konvertiert: number; faelle_abgeschlossen: number; aktive_faelle: number; umsatz_generiert: number }
type Incentive = { id: string; titel: string; beschreibung: string | null; kategorie: string; typ: string; bedingung: string; wert: number }

const MEDAL = ['text-amber-300', 'text-zinc-400', 'text-orange-400']

export default function PerformanceClient({ profile, stats, performanceHistory, incentives, leaderboard, monatLabel, userId }: {
  profile: { vorname: string | null; nachname: string | null; kategorie: string | null; kapazitaet_max: number | null }
  stats: { leadsTotal: number; leadsKonv: number; aktiveFaelle: number; abgeschlossen: number; isDispatch: boolean }
  performanceHistory: Perf[]
  incentives: Incentive[]
  leaderboard: { id: string; name: string; value: number }[]
  monatLabel: string
  userId: string
}) {
  const name = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || '—'
  const fmt = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
  const myRank = leaderboard.findIndex(l => l.id === userId) + 1

  return (
    <div className="px-4 py-8"><div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2"><BarChart3Icon className="w-5 h-5 text-blue-400" />Meine Performance</h1>
        <p className="text-zinc-500 text-sm mt-0.5">{name} · {monatLabel}</p>
      </div>

      {/* KPI Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.isDispatch ? (<>
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-amber-400" />} label="Leads qualifiziert" value={stats.leadsTotal} />
          <KPI icon={<BriefcaseIcon className="w-4 h-4 text-green-400" />} label="Konvertiert" value={stats.leadsKonv} />
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-blue-400" />} label="Conv. Rate" value={stats.leadsTotal > 0 ? `${Math.round((stats.leadsKonv / stats.leadsTotal) * 100)}%` : '—'} />
        </>) : (<>
          <KPI icon={<BriefcaseIcon className="w-4 h-4 text-blue-400" />} label="Aktive Faelle" value={stats.aktiveFaelle} />
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-green-400" />} label="Abgeschlossen" value={stats.abgeschlossen} />
          <KPI icon={<ClockIcon className="w-4 h-4 text-amber-400" />} label="Kapazitaet" value={`${stats.aktiveFaelle}/${profile.kapazitaet_max ?? 100}`} />
        </>)}
        <KPI icon={<TrophyIcon className="w-4 h-4 text-amber-400" />} label="Rang" value={myRank > 0 ? `#${myRank}` : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leaderboard meiner Kategorie */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold flex items-center gap-2"><TrophyIcon className="w-4 h-4 text-amber-400" />{stats.isDispatch ? 'Dispatch' : 'Kundenbetreuer'}-Ranking</h2>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {leaderboard.map((entry, i) => (
              <div key={entry.id} className={`px-5 py-3 flex items-center justify-between ${entry.id === userId ? 'bg-blue-950/30 border-l-2 border-blue-500' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold w-6 ${i < 3 ? MEDAL[i] : 'text-zinc-500'}`}>{i + 1}</span>
                  <span className={`text-sm ${entry.id === userId ? 'text-white font-semibold' : 'text-zinc-300'}`}>{entry.name}{entry.id === userId ? ' (Du)' : ''}</span>
                </div>
                <span className="text-sm text-zinc-400 tabular-nums font-semibold">{entry.value}</span>
              </div>
            ))}
            {leaderboard.length === 0 && <div className="px-5 py-8 text-center text-zinc-500">Keine Daten</div>}
          </div>
        </div>

        {/* Erreichbare Incentives */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold flex items-center gap-2"><GiftIcon className="w-4 h-4 text-violet-400" />Erreichbare Incentives</h2>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {incentives.map(inc => (
              <div key={inc.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-200 text-sm font-medium">{inc.titel}</span>
                  <span className="text-green-400 text-sm font-semibold">{fmt(inc.wert)}</span>
                </div>
                <p className="text-zinc-500 text-xs mt-0.5">{inc.bedingung}</p>
                {inc.beschreibung && <p className="text-zinc-600 text-xs mt-0.5">{inc.beschreibung}</p>}
              </div>
            ))}
            {incentives.length === 0 && <div className="px-5 py-8 text-center text-zinc-500">Keine Incentives verfuegbar</div>}
          </div>
        </div>
      </div>

      {/* Performance-Verlauf */}
      {performanceHistory.length > 0 && (
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 mt-6">
          <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">Monatsvergleich</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-zinc-800">
                <th className="text-left px-3 py-2 text-zinc-400 font-medium">Monat</th>
                <th className="text-right px-3 py-2 text-zinc-400 font-medium">{stats.isDispatch ? 'Leads' : 'Aktiv'}</th>
                <th className="text-right px-3 py-2 text-zinc-400 font-medium">{stats.isDispatch ? 'Konvertiert' : 'Abgeschl.'}</th>
                <th className="text-right px-3 py-2 text-zinc-400 font-medium">Umsatz</th>
              </tr></thead>
              <tbody>
                {performanceHistory.map(p => (
                  <tr key={`${p.monat}-${p.jahr}`} className="border-b border-zinc-800/50">
                    <td className="px-3 py-2 text-zinc-300">{p.monat} {p.jahr}</td>
                    <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">{stats.isDispatch ? p.leads_qualifiziert : p.aktive_faelle}</td>
                    <td className="px-3 py-2 text-right text-green-400 tabular-nums">{stats.isDispatch ? p.leads_konvertiert : p.faelle_abgeschlossen}</td>
                    <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">{fmt(p.umsatz_generiert ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div></div>
  )
}

function KPI({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-zinc-500 text-xs">{label}</span></div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  )
}
