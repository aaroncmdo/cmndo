'use client'

import Link from 'next/link'
import { TrophyIcon, UsersIcon, GiftIcon, ArrowUpIcon, ArrowDownIcon, MinusIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

type DispatchEntry = { id: string; name: string; leads_qualifiziert: number; leads_konvertiert: number; conversion_rate: number; trend: number }
type KundenEntry = { id: string; name: string; aktive_faelle: number; faelle_abgeschlossen: number; avg_bearbeitungszeit: number; trend: number }

const MEDAL = ['bg-amber-500/20 text-amber-300 border-amber-500/40', 'bg-zinc-400/20 text-claimondo-navy border-zinc-400/40', 'bg-orange-700/20 text-orange-300 border-orange-700/40']

function TrendBadge({ value }: { value: number }) {
  if (value > 0) return <span className="flex items-center gap-0.5 text-green-400 text-xs"><ArrowUpIcon className="w-3 h-3" />+{value}</span>
  if (value < 0) return <span className="flex items-center gap-0.5 text-red-400 text-xs"><ArrowDownIcon className="w-3 h-3" />{value}</span>
  return <span className="flex items-center gap-0.5 text-claimondo-ondo text-xs"><MinusIcon className="w-3 h-3" />0</span>
}

export default function LeaderboardClient({ dispatch, kundenbetreuer, monatLabel }: {
  dispatch: DispatchEntry[]
  kundenbetreuer: KundenEntry[]
  monatLabel: string
}) {
  return (
    <div className="py-8"><div className="space-y-6">
      <PageHeader
        title="Leaderboard"
        description={`${monatLabel} · vs. Vormonat`}
        icon={TrophyIcon}
      />

      <div className="flex gap-2">
        <Link href="/admin/team" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f8f9fb] text-claimondo-ondo hover:text-claimondo-navy text-xs font-medium rounded-lg transition-colors"><UsersIcon className="w-3.5 h-3.5" />Übersicht</Link>
        <Link href="/admin/team/leaderboard" className="px-3 py-1.5 bg-[#1E3A5F] text-white text-xs font-medium rounded-lg"><TrophyIcon className="w-3.5 h-3.5 inline mr-1.5" />Leaderboard</Link>
        <Link href="/admin/team/incentives" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f8f9fb] text-claimondo-ondo hover:text-claimondo-navy text-xs font-medium rounded-lg transition-colors"><GiftIcon className="w-3.5 h-3.5" />Incentives</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dispatch Leaderboard */}
        <div className="glass-light rounded-ios-md border border-claimondo-border overflow-hidden">
          <div className="px-5 py-4 border-b border-claimondo-border">
            <h2 className="text-claimondo-navy font-semibold flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400 rounded-full" />Dispatch
            </h2>
            <p className="text-claimondo-ondo text-xs mt-0.5">Sortiert nach Leads qualifiziert</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-claimondo-border">
                <th className="text-left px-4 py-3 text-claimondo-ondo font-medium w-10">#</th>
                <th className="text-left px-4 py-3 text-claimondo-ondo font-medium">Name</th>
                <th className="text-right px-4 py-3 text-claimondo-ondo font-medium">Quali.</th>
                <th className="text-right px-4 py-3 text-claimondo-ondo font-medium">Konv.</th>
                <th className="text-right px-4 py-3 text-claimondo-ondo font-medium">Rate</th>
                <th className="text-right px-4 py-3 text-claimondo-ondo font-medium">Trend</th>
              </tr></thead>
              <tbody>
                {dispatch.map((d, i) => (
                  <tr key={d.id} className="border-b border-claimondo-border/50 hover:bg-[#f8f9fb]/40 transition-colors">
                    <td className="px-4 py-3">
                      {i < 3 ? <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs font-bold ${MEDAL[i]}`}>{i + 1}</span> : <span className="text-claimondo-ondo text-xs pl-2">{i + 1}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/team/${d.id}`} className="text-claimondo-navy font-medium hover:text-claimondo-navy transition-colors">{d.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-right text-claimondo-navy tabular-nums font-semibold">{d.leads_qualifiziert}</td>
                    <td className="px-4 py-3 text-right text-green-400 tabular-nums">{d.leads_konvertiert}</td>
                    <td className="px-4 py-3 text-right text-claimondo-navy tabular-nums">{d.conversion_rate}%</td>
                    <td className="px-4 py-3 text-right"><TrendBadge value={d.trend} /></td>
                  </tr>
                ))}
                {dispatch.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-claimondo-ondo">Keine Dispatch-Mitarbeiter</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Kundenbetreuer Leaderboard */}
        <div className="glass-light rounded-ios-md border border-claimondo-border overflow-hidden">
          <div className="px-5 py-4 border-b border-claimondo-border">
            <h2 className="text-claimondo-navy font-semibold flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full" />Kundenbetreuer
            </h2>
            <p className="text-claimondo-ondo text-xs mt-0.5">Sortiert nach Faelle abgeschlossen</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-claimondo-border">
                <th className="text-left px-4 py-3 text-claimondo-ondo font-medium w-10">#</th>
                <th className="text-left px-4 py-3 text-claimondo-ondo font-medium">Name</th>
                <th className="text-right px-4 py-3 text-claimondo-ondo font-medium">Aktiv</th>
                <th className="text-right px-4 py-3 text-claimondo-ondo font-medium">Abg.</th>
                <th className="text-right px-4 py-3 text-claimondo-ondo font-medium">Avg Tage</th>
                <th className="text-right px-4 py-3 text-claimondo-ondo font-medium">Trend</th>
              </tr></thead>
              <tbody>
                {kundenbetreuer.map((k, i) => (
                  <tr key={k.id} className="border-b border-claimondo-border/50 hover:bg-[#f8f9fb]/40 transition-colors">
                    <td className="px-4 py-3">
                      {i < 3 ? <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs font-bold ${MEDAL[i]}`}>{i + 1}</span> : <span className="text-claimondo-ondo text-xs pl-2">{i + 1}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/team/${k.id}`} className="text-claimondo-navy font-medium hover:text-claimondo-navy transition-colors">{k.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-right text-claimondo-navy tabular-nums">{k.aktive_faelle}</td>
                    <td className="px-4 py-3 text-right text-green-400 tabular-nums font-semibold">{k.faelle_abgeschlossen}</td>
                    <td className="px-4 py-3 text-right text-claimondo-navy tabular-nums">{k.avg_bearbeitungszeit || '—'}</td>
                    <td className="px-4 py-3 text-right"><TrendBadge value={k.trend} /></td>
                  </tr>
                ))}
                {kundenbetreuer.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-claimondo-ondo">Keine Kundenbetreuer</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div></div>
  )
}
