'use client'

import Link from 'next/link'
import { TrophyIcon, UsersIcon, GiftIcon, ArrowUpIcon, ArrowDownIcon, MinusIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

type DispatchEntry = { id: string; name: string; leads_qualifiziert: number; leads_konvertiert: number; conversion_rate: number; trend: number }
type KundenEntry = { id: string; name: string; aktive_faelle: number; faelle_abgeschlossen: number; avg_bearbeitungszeit: number; trend: number }

const MEDAL = ['bg-amber-500/20 text-amber-300 border-amber-500/40', 'bg-claimondo-ondo/20 text-claimondo-navy border-claimondo-ondo/40', 'bg-orange-700/20 text-orange-300 border-orange-700/40']

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
        <Link href="/admin/team" className="flex items-center gap-1.5 px-3 py-1.5 bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy text-xs font-medium rounded-lg transition-colors"><UsersIcon className="w-3.5 h-3.5" />Übersicht</Link>
        <Link href="/admin/team/leaderboard" className="px-3 py-1.5 bg-claimondo-shield text-white text-xs font-medium rounded-lg"><TrophyIcon className="w-3.5 h-3.5 inline mr-1.5" />Leaderboard</Link>
        <Link href="/admin/team/incentives" className="flex items-center gap-1.5 px-3 py-1.5 bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy text-xs font-medium rounded-lg transition-colors"><GiftIcon className="w-3.5 h-3.5" />Incentives</Link>
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
          <DataTableContainer variant="plain">
            <Table>
              <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
                <Tr className="border-b border-claimondo-border">
                  <Th className="text-left text-claimondo-ondo! w-10">#</Th>
                  <Th className="text-left text-claimondo-ondo!">Name</Th>
                  <Th className="text-right text-claimondo-ondo!">Quali.</Th>
                  <Th className="text-right text-claimondo-ondo!">Konv.</Th>
                  <Th className="text-right text-claimondo-ondo!">Rate</Th>
                  <Th className="text-right text-claimondo-ondo!">Trend</Th>
                </Tr>
              </Thead>
              <Tbody className="divide-y-0!">
                {dispatch.map((d, i) => (
                  <Tr key={d.id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40 transition-colors">
                    <Td>
                      {i < 3 ? <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs font-bold ${MEDAL[i]}`}>{i + 1}</span> : <span className="text-claimondo-ondo text-xs pl-2">{i + 1}</span>}
                    </Td>
                    <Td>
                      <Link href={`/admin/team/${d.id}`} className="text-claimondo-navy font-medium hover:text-claimondo-navy transition-colors">{d.name}</Link>
                    </Td>
                    <Td className="text-right tabular-nums font-semibold">{d.leads_qualifiziert}</Td>
                    <Td className="text-right text-green-400! tabular-nums">{d.leads_konvertiert}</Td>
                    <Td className="text-right tabular-nums">{d.conversion_rate}%</Td>
                    <Td className="text-right"><TrendBadge value={d.trend} /></Td>
                  </Tr>
                ))}
                {dispatch.length === 0 && <Tr><Td colSpan={6} className="py-8! text-center text-claimondo-ondo!">Keine Dispatch-Mitarbeiter</Td></Tr>}
              </Tbody>
            </Table>
          </DataTableContainer>
        </div>

        {/* Kundenbetreuer Leaderboard */}
        <div className="glass-light rounded-ios-md border border-claimondo-border overflow-hidden">
          <div className="px-5 py-4 border-b border-claimondo-border">
            <h2 className="text-claimondo-navy font-semibold flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full" />Kundenbetreuer
            </h2>
            <p className="text-claimondo-ondo text-xs mt-0.5">Sortiert nach Faelle abgeschlossen</p>
          </div>
          <DataTableContainer variant="plain">
            <Table>
              <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
                <Tr className="border-b border-claimondo-border">
                  <Th className="text-left text-claimondo-ondo! w-10">#</Th>
                  <Th className="text-left text-claimondo-ondo!">Name</Th>
                  <Th className="text-right text-claimondo-ondo!">Aktiv</Th>
                  <Th className="text-right text-claimondo-ondo!">Abg.</Th>
                  <Th className="text-right text-claimondo-ondo!">Avg Tage</Th>
                  <Th className="text-right text-claimondo-ondo!">Trend</Th>
                </Tr>
              </Thead>
              <Tbody className="divide-y-0!">
                {kundenbetreuer.map((k, i) => (
                  <Tr key={k.id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40 transition-colors">
                    <Td>
                      {i < 3 ? <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs font-bold ${MEDAL[i]}`}>{i + 1}</span> : <span className="text-claimondo-ondo text-xs pl-2">{i + 1}</span>}
                    </Td>
                    <Td>
                      <Link href={`/admin/team/${k.id}`} className="text-claimondo-navy font-medium hover:text-claimondo-navy transition-colors">{k.name}</Link>
                    </Td>
                    <Td className="text-right tabular-nums">{k.aktive_faelle}</Td>
                    <Td className="text-right text-green-400! tabular-nums font-semibold">{k.faelle_abgeschlossen}</Td>
                    <Td className="text-right tabular-nums">{k.avg_bearbeitungszeit || '—'}</Td>
                    <Td className="text-right"><TrendBadge value={k.trend} /></Td>
                  </Tr>
                ))}
                {kundenbetreuer.length === 0 && <Tr><Td colSpan={6} className="py-8! text-center text-claimondo-ondo!">Keine Kundenbetreuer</Td></Tr>}
              </Tbody>
            </Table>
          </DataTableContainer>
        </div>
      </div>
    </div></div>
  )
}
