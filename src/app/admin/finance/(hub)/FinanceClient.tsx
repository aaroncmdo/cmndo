'use client'

import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUpIcon, FolderIcon, CalculatorIcon, PercentIcon } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

// ─── Types ───────────────────────────────────────────────────────────────────

type Props = {
  mrr: number
  aktiveSvCount: number
  aktiveFaelle: number
  avgFallwert: number
  provisionMonat: number
  chartData: { monat: string; faelle: number }[]
  tabellenDaten: {
    id: string
    claim_nummer: string | null
    kunde: string
    betrag: number
    provision: number
    datum: string | null
  }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function eur(val: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function FinanceClient({
  mrr,
  aktiveSvCount,
  aktiveFaelle,
  avgFallwert,
  provisionMonat,
  chartData,
  tabellenDaten,
}: Props) {
  return (
    <div className="py-8">
      <div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatCard
            label="MRR"
            value={eur(mrr)}
            hint={`${aktiveSvCount} aktive SVs`}
            icon={TrendingUpIcon}
            tone="success"
          />
          <StatCard
            label="Aktive Fälle"
            value={String(aktiveFaelle)}
            hint="Diesen Monat"
            icon={FolderIcon}
            tone="navy"
          />
          <StatCard
            label="Ø Fallwert"
            value={eur(avgFallwert)}
            hint="Regulierungsbetrag"
            icon={CalculatorIcon}
            tone="ondo"
          />
          <StatCard
            label="Provision"
            value={eur(provisionMonat)}
            hint="10 % — dieser Monat"
            icon={PercentIcon}
            tone="ondo"
          />
        </div>

        {/* AAR-153: Sub-Navigation innerhalb Finanzen. Die „Maik-Provisionen"-
            Seite hängt jetzt unter /admin/finance statt als eigener Nav-Eintrag
            oben — damit Aaron einen Einstiegspunkt auf der Haupt-Finance-Page
            hat statt zwei getrennter Menüpunkte. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          <Link
            href="/admin/finance/provisionen"
            className="group glass-light border border-claimondo-border rounded-ios-md p-5 hover:border-claimondo-ondo hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider">
                  Partner-Provisionen
                </p>
                <h3 className="text-base font-semibold text-claimondo-navy mt-0.5">
                  Maik-Provisionen verwalten
                </h3>
                <p className="text-xs text-claimondo-ondo mt-1">
                  Monatsübersicht je Lead: 150&nbsp;€ minus tatsächlicher CPL.
                  Status offen / bezahlt.
                </p>
              </div>
              <span className="text-claimondo-ondo group-hover:translate-x-0.5 transition-transform shrink-0">
                →
              </span>
            </div>
          </Link>
          <Link
            href="/admin/finance/kanzlei"
            className="group glass-light border border-claimondo-border rounded-ios-md p-5 hover:border-claimondo-ondo hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider">
                  Kanzlei-Abrechnungen
                </p>
                <h3 className="text-base font-semibold text-claimondo-navy mt-0.5">
                  LexDrive-Monatsabrechnung
                </h3>
                <p className="text-xs text-claimondo-ondo mt-1">
                  Pauschalen pro abgeschlossenem Fall, Rechnungen an die
                  Partnerkanzlei versenden.
                </p>
              </div>
              <span className="text-claimondo-ondo group-hover:translate-x-0.5 transition-transform shrink-0">
                →
              </span>
            </div>
          </Link>
        </div>

        {/* Chart */}
        <div className="glass-light border border-claimondo-border rounded-ios-md p-5 mb-8">
          <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider mb-4">
            Fälle pro Monat
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="monat"
                  tick={{ fill: '#71717a', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#52525b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: 12,
                    fontSize: 13,
                  }}
                  labelStyle={{ color: '#a1a1aa' }}
                  itemStyle={{ color: '#fff' }}
                  cursor={{ fill: 'rgba(63,63,70,0.3)' }}
                />
                <Bar
                  dataKey="faelle"
                  name="Fälle"
                  fill="#4573A2"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabelle */}
        <div className="glass-light border border-claimondo-border rounded-ios-md overflow-hidden">
          <div className="px-5 py-4 border-b border-claimondo-border">
            <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider">
              Letzte abgeschlossene Fälle
            </h2>
          </div>

          {tabellenDaten.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-claimondo-ondo/70 text-sm">Noch keine abgeschlossenen Fälle.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <DataTableContainer variant="plain" className="hidden sm:block">
                <Table>
                  <Thead className="!bg-transparent border-b border-claimondo-border">
                    <Tr>
                      <Th className="text-left px-5 !text-claimondo-ondo">Fall-Nr.</Th>
                      <Th className="text-left px-5 !text-claimondo-ondo">Kunde</Th>
                      <Th className="text-right px-5 !text-claimondo-ondo">Betrag</Th>
                      <Th className="text-right px-5 !text-claimondo-ondo">Provision</Th>
                      <Th className="text-right px-5 !text-claimondo-ondo">Datum</Th>
                    </Tr>
                  </Thead>
                  <Tbody className="!divide-y-0">
                    {tabellenDaten.map((row) => (
                      <Tr key={row.id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40 transition-colors">
                        <Td className="px-5">
                          <Link
                            href={`/faelle/${row.id}`}
                            target="_blank"
                            rel="noopener"
                            className="text-claimondo-light-blue hover:text-claimondo-light-blue font-mono text-xs"
                          >
                            {row.claim_nummer ?? row.id.slice(0, 8)}
                          </Link>
                        </Td>
                        <Td className="px-5">{row.kunde}</Td>
                        <Td className="px-5 text-right tabular-nums">{eur(row.betrag)}</Td>
                        <Td className="px-5 !text-emerald-400 text-right tabular-nums">{eur(row.provision)}</Td>
                        <Td className="px-5 !text-claimondo-ondo text-right text-xs">{fmtDate(row.datum)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                  <tfoot>
                    <tr className="border-t border-claimondo-border">
                      <td colSpan={2} className="px-5 py-3 text-claimondo-ondo text-sm font-medium">Gesamt</td>
                      <td className="px-5 py-3 text-claimondo-navy text-right tabular-nums font-semibold text-sm">
                        {eur(tabellenDaten.reduce((s, r) => s + r.betrag, 0))}
                      </td>
                      <td className="px-5 py-3 text-emerald-400 text-right tabular-nums font-semibold text-sm">
                        {eur(tabellenDaten.reduce((s, r) => s + r.provision, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </Table>
              </DataTableContainer>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-claimondo-border/50">
                {tabellenDaten.map((row) => (
                  <Link
                    key={row.id}
                    href={`/faelle/${row.id}`}
                    target="_blank"
                    rel="noopener"
                    className="block px-5 py-4 hover:bg-claimondo-bg/40 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <span className="text-claimondo-light-blue font-mono text-xs">
                          {row.claim_nummer ?? row.id.slice(0, 8)}
                        </span>
                        <p className="text-claimondo-navy text-sm mt-0.5">{row.kunde}</p>
                      </div>
                      <span className="text-claimondo-navy text-sm font-semibold tabular-nums">{eur(row.betrag)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-claimondo-ondo">{fmtDate(row.datum)}</span>
                      <span className="text-emerald-400 tabular-nums">+{eur(row.provision)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}

