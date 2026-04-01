'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'

// ─── Types ──────────────────────────────────────────────────────────────────

type Fall = {
  id: string
  status: string
  schadens_ursache: string | null
  sv_id: string | null
  regulierung_betrag: number | null
  regulierung_am: string | null
  gutachten_betrag: number | null
  gutachten_eingegangen_am: string | null
  sv_zugewiesen_am: string | null
  created_at: string
  updated_at: string | null
}

type Lead = {
  id: string
  status: string
  created_at: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ersterfassung: '#3b82f6',
  'sv-zugewiesen': '#eab308',
  'sv-termin': '#f59e0b',
  'gutachten-eingegangen': '#f97316',
  filmcheck: '#a855f7',
  'kanzlei-uebergeben': '#06b6d4',
  anschlussschreiben: '#22d3ee',
  regulierung: '#22c55e',
  abgeschlossen: '#6b7280',
  storniert: '#ef4444',
}

const PIE_COLORS = ['#3b82f6', '#f97316', '#ef4444', '#eab308', '#a855f7', '#22c55e', '#06b6d4']

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasser',
  sachbeschaedigung: 'Sachbesch.',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturm',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiß',
  sonstiges: 'Sonstiges',
}

const STATUS_LABEL: Record<string, string> = {
  ersterfassung: 'Ersterfassung',
  'sv-zugewiesen': 'SV zugewiesen',
  'sv-termin': 'SV Termin',
  'gutachten-eingegangen': 'Gutachten',
  filmcheck: 'Filmcheck',
  'kanzlei-uebergeben': 'Kanzlei',
  anschlussschreiben: 'Anschluss',
  regulierung: 'Regulierung',
  abgeschlossen: 'Abgeschl.',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function monthKey(d: string) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string) {
  const [y, m] = key.split('-')
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  return `${months[parseInt(m) - 1]} ${y.slice(2)}`
}

function last6Months(): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return result
}

function inRange(dateStr: string, von: string, bis: string): boolean {
  if (!dateStr) return false
  const d = dateStr.slice(0, 10)
  if (von && d < von) return false
  if (bis && d > bis) return false
  return true
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function StatistikenClient({
  faelle,
  leads,
  svNameMap,
}: {
  faelle: Fall[]
  leads: Lead[]
  svNameMap: Record<string, string>
}) {
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')

  const filteredFaelle = useMemo(
    () => (von || bis) ? faelle.filter(f => inRange(f.created_at, von, bis)) : faelle,
    [faelle, von, bis]
  )

  const filteredLeads = useMemo(
    () => (von || bis) ? leads.filter(l => inRange(l.created_at, von, bis)) : leads,
    [leads, von, bis]
  )

  // ─── 1. Fälle nach Status (gestapeltes Balkendiagramm, 6 Monate)
  const months = last6Months()
  const statusKeys = Object.keys(STATUS_LABEL)

  const stackedData = useMemo(() => {
    return months.map(m => {
      const row: Record<string, string | number> = { month: monthLabel(m) }
      const monthFaelle = filteredFaelle.filter(f => monthKey(f.created_at) === m)
      for (const s of statusKeys) {
        row[s] = monthFaelle.filter(f => f.status === s).length
      }
      return row
    })
  }, [filteredFaelle, months, statusKeys])

  // ─── 2. Durchschnittliche Durchlaufzeit pro Phase
  const phaseData = useMemo(() => {
    const phases = [
      { key: 'Ersterfassung → SV', from: 'created_at', to: 'sv_zugewiesen_am' },
      { key: 'SV → Gutachten', from: 'sv_zugewiesen_am', to: 'gutachten_eingegangen_am' },
      { key: 'Gutachten → Regulierung', from: 'gutachten_eingegangen_am', to: 'regulierung_am' },
    ]
    return phases.map(p => {
      const durations = filteredFaelle
        .filter(f => (f as Record<string, unknown>)[p.from] && (f as Record<string, unknown>)[p.to])
        .map(f => {
          const start = new Date((f as Record<string, unknown>)[p.from] as string).getTime()
          const end = new Date((f as Record<string, unknown>)[p.to] as string).getTime()
          return (end - start) / 86400000
        })
        .filter(d => d >= 0)
      const avg = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
      return { phase: p.key, tage: avg }
    })
  }, [filteredFaelle])

  // ─── 3. Top 5 Schadensarten
  const pieData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const f of filteredFaelle) {
      const k = f.schadens_ursache ?? 'sonstiges'
      counts[k] = (counts[k] ?? 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name: URSACHE_LABEL[name] ?? name, value }))
  }, [filteredFaelle])

  // ─── 4. SV-Performance
  const svPerf = useMemo(() => {
    const map: Record<string, { count: number; gutachtenSum: number; gutachtenCount: number }> = {}
    for (const f of filteredFaelle) {
      if (!f.sv_id) continue
      if (!map[f.sv_id]) map[f.sv_id] = { count: 0, gutachtenSum: 0, gutachtenCount: 0 }
      map[f.sv_id].count++
      if (f.gutachten_betrag != null) {
        map[f.sv_id].gutachtenSum += Number(f.gutachten_betrag)
        map[f.sv_id].gutachtenCount++
      }
    }
    return Object.entries(map)
      .map(([svId, d]) => ({
        name: svNameMap[svId] ?? svId.slice(0, 8),
        faelle: d.count,
        avgBetrag: d.gutachtenCount > 0 ? Math.round(d.gutachtenSum / d.gutachtenCount) : 0,
      }))
      .sort((a, b) => b.faelle - a.faelle)
      .slice(0, 10)
  }, [filteredFaelle, svNameMap])

  // ─── 5. Conversion Funnel
  const funnel = useMemo(() => {
    const total = filteredLeads.length
    const qualified = filteredLeads.filter(l => !['neu', 'kalt', 'disqualifiziert'].includes(l.status)).length
    const flowSent = filteredLeads.filter(l => ['flow-gesendet', 'umgewandelt', 'umgewandelt-sv'].includes(l.status)).length
    const converted = filteredLeads.filter(l => ['umgewandelt', 'umgewandelt-sv'].includes(l.status)).length
    const closed = filteredFaelle.filter(f => f.status === 'abgeschlossen').length
    return [
      { step: 'Leads', count: total },
      { step: 'Qualifiziert', count: qualified },
      { step: 'Flow gesendet', count: flowSent },
      { step: 'Umgewandelt', count: converted },
      { step: 'Abgeschlossen', count: closed },
    ]
  }, [filteredLeads, filteredFaelle])

  // ─── 6. Monatliche Regulierungssumme
  const regData = useMemo(() => {
    return months.map(m => {
      const sum = filteredFaelle
        .filter(f => f.regulierung_am && monthKey(f.regulierung_am) === m)
        .reduce((acc, f) => acc + Number(f.regulierung_betrag ?? 0), 0)
      return { month: monthLabel(m), betrag: Math.round(sum) }
    })
  }, [filteredFaelle, months])

  // ─── Render ───────────────────────────────────────────────────────────────

  const tooltipStyle = {
    contentStyle: { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 12 },
    labelStyle: { color: '#a1a1aa' },
  }

  return (
    <div className="px-4 py-6">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Statistiken</h1>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={von}
              onChange={e => setVon(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] [color-scheme:dark]"
              placeholder="Von"
            />
            <span className="text-gray-400 text-sm">—</span>
            <input
              type="date"
              value={bis}
              onChange={e => setBis(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] [color-scheme:dark]"
              placeholder="Bis"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 1. Fälle nach Status */}
          <ChartCard title="Fälle nach Status (6 Monate)">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stackedData}>
                <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                {statusKeys.map(s => (
                  <Bar key={s} dataKey={s} stackId="a" fill={STATUS_COLORS[s]} name={STATUS_LABEL[s]} radius={s === statusKeys[statusKeys.length - 1] ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 2. Durchlaufzeit */}
          <ChartCard title="Durchschnittliche Durchlaufzeit (Tage)">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={phaseData} layout="vertical">
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="phase" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} width={140} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="tage" fill="#8b5cf6" radius={[0, 6, 6, 0]} name="Tage" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 3. Top 5 Schadensarten */}
          <ChartCard title="Top 5 Schadensarten">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" nameKey="name" label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 4. SV-Performance */}
          <ChartCard title="SV-Performance">
            {svPerf.length === 0 ? (
              <p className="text-gray-400 text-sm py-10 text-center">Keine Daten</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left text-gray-500 font-medium py-2 px-2 text-xs">Name</th>
                      <th className="text-right text-gray-500 font-medium py-2 px-2 text-xs">Fälle</th>
                      <th className="text-right text-gray-500 font-medium py-2 px-2 text-xs">Ø Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {svPerf.map((s, i) => (
                      <tr key={i} className="border-b border-gray-200/50">
                        <td className="py-2.5 px-2 text-gray-800">{s.name}</td>
                        <td className="py-2.5 px-2 text-gray-500 text-right tabular-nums">{s.faelle}</td>
                        <td className="py-2.5 px-2 text-gray-500 text-right tabular-nums">{s.avgBetrag > 0 ? `${s.avgBetrag.toLocaleString('de-DE')} €` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>

          {/* 5. Conversion Funnel */}
          <ChartCard title="Conversion Funnel">
            <div className="space-y-2 py-4">
              {funnel.map((f, i) => {
                const maxCount = funnel[0].count || 1
                const pct = Math.round((f.count / maxCount) * 100)
                return (
                  <div key={f.step}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">{f.step}</span>
                      <span className="text-gray-700 tabular-nums font-medium">{f.count}</span>
                    </div>
                    <div className="h-6 bg-gray-100 rounded-lg overflow-hidden">
                      <div
                        className="h-full rounded-lg transition-all"
                        style={{
                          width: `${Math.max(pct, 2)}%`,
                          backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </ChartCard>

          {/* 6. Monatliche Regulierungssumme */}
          <ChartCard title="Monatliche Regulierungssumme">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={regData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${Number(v).toLocaleString('de-DE')} €`, 'Betrag']} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
                <Line type="monotone" dataKey="betrag" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 4 }} name="Regulierung" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  )
}

// ─── Chart Card ─────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h2 className="text-sm font-medium text-gray-500 mb-4">{title}</h2>
      {children}
    </div>
  )
}
