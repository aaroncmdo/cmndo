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
    fall_nummer: string | null
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
  return new Date(d).toLocaleDateString('de-DE', {
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
    <div className="px-4 py-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Finanzen</h1>
          <p className="text-gray-500 text-sm">Umsatz, Provision & Kennzahlen</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <KpiCard
            label="MRR"
            value={eur(mrr)}
            sub={`${aktiveSvCount} aktive SVs`}
            accent="text-emerald-400"
          />
          <KpiCard
            label="Aktive Fälle"
            value={String(aktiveFaelle)}
            sub="Diesen Monat"
          />
          <KpiCard
            label="Ø Fallwert"
            value={eur(avgFallwert)}
            sub="Regulierungsbetrag"
          />
          <KpiCard
            label="Provision"
            value={eur(provisionMonat)}
            sub="10 % — dieser Monat"
            accent="text-[#7BA3CC]"
          />
        </div>

        {/* Chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
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
                  fill="#3b82f6"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabelle */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Letzte abgeschlossene Fälle
            </h2>
          </div>

          {tabellenDaten.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-400 text-sm">Noch keine abgeschlossenen Fälle.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-5 py-3 text-gray-500 font-medium">Fall-Nr.</th>
                      <th className="text-left px-5 py-3 text-gray-500 font-medium">Kunde</th>
                      <th className="text-right px-5 py-3 text-gray-500 font-medium">Betrag</th>
                      <th className="text-right px-5 py-3 text-gray-500 font-medium">Provision</th>
                      <th className="text-right px-5 py-3 text-gray-500 font-medium">Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabellenDaten.map((row) => (
                      <tr key={row.id} className="border-b border-gray-200/50 hover:bg-gray-100/40 transition-colors">
                        <td className="px-5 py-3">
                          <Link
                            href={`/admin/faelle/${row.id}`}
                            className="text-[#7BA3CC] hover:text-[#7BA3CC] font-mono text-xs"
                          >
                            {row.fall_nummer ?? row.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-gray-800">{row.kunde}</td>
                        <td className="px-5 py-3 text-gray-800 text-right tabular-nums">{eur(row.betrag)}</td>
                        <td className="px-5 py-3 text-emerald-400 text-right tabular-nums">{eur(row.provision)}</td>
                        <td className="px-5 py-3 text-gray-500 text-right text-xs">{fmtDate(row.datum)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-300">
                      <td colSpan={2} className="px-5 py-3 text-gray-500 text-sm font-medium">Gesamt</td>
                      <td className="px-5 py-3 text-gray-900 text-right tabular-nums font-semibold text-sm">
                        {eur(tabellenDaten.reduce((s, r) => s + r.betrag, 0))}
                      </td>
                      <td className="px-5 py-3 text-emerald-400 text-right tabular-nums font-semibold text-sm">
                        {eur(tabellenDaten.reduce((s, r) => s + r.provision, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-gray-200/50">
                {tabellenDaten.map((row) => (
                  <Link
                    key={row.id}
                    href={`/admin/faelle/${row.id}`}
                    className="block px-5 py-4 hover:bg-gray-100/40 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <span className="text-[#7BA3CC] font-mono text-xs">
                          {row.fall_nummer ?? row.id.slice(0, 8)}
                        </span>
                        <p className="text-gray-800 text-sm mt-0.5">{row.kunde}</p>
                      </div>
                      <span className="text-gray-900 text-sm font-semibold tabular-nums">{eur(row.betrag)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{fmtDate(row.datum)}</span>
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

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-gray-400 text-xs mt-1">{sub}</p>
    </div>
  )
}
