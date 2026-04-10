'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid,
} from 'recharts'
import DrillDownModal from '@/components/admin/DrillDownModal'
import type { DrillDownItem } from '@/lib/analytics'
import type {
  UserStatistikRolle,
  StatistikFall,
  StatistikKlassifizierung,
  Benchmark,
} from './page'

// ─── Constants ──────────────────────────────────────────────────────────────

const ONDO_BLUE = '#4573A2'
const NAVY = '#0D1B3E'

const KUERZUNGSGRUND_LABELS: Record<string, string> = {
  honorarkuerzung_pauschal: 'Honorarkürzung pauschal',
  mithaftung_kunde: 'Mithaftung Kunde',
  gutachten_formaler_mangel: 'Gutachten formaler Mangel',
  gutachten_inhaltlicher_mangel: 'Gutachten inhaltlicher Mangel',
  verspaetete_meldung: 'Verspätete Meldung',
  bagatelle: 'Bagatelle',
  verweigerung_versicherer: 'Verweigerung Versicherer',
  sonstiges: 'Sonstiges',
}

const UNFALL_LABELS: Record<string, string> = {
  auffahrunfall: 'Auffahrunfall',
  spurwechsel: 'Spurwechsel',
  parkschaden: 'Parkschaden',
  vorfahrt: 'Vorfahrt',
  tueroeffnung: 'Türöffnung',
  wildunfall: 'Wildunfall',
  glatteis: 'Glatteis',
  sonstiges: 'Sonstiges',
}

const FAHRZEUGTYP_LABELS: Record<string, string> = {
  pkw: 'PKW',
  lkw: 'LKW',
  transporter: 'Transporter',
  motorrad: 'Motorrad',
  fahrrad: 'Fahrrad',
  fussgaenger: 'Fußgänger',
  bus: 'Bus',
  sonstiges: 'Sonstiges',
}

const CHART_COLORS = [ONDO_BLUE, '#1E3A5F', '#7BA3CC', '#2d5f8a', '#5a9bd5', '#3b6d99', '#8fb8de', '#14375a']

const ZEITRAUM_OPTIONS = [
  { label: '30 Tage', days: 30 },
  { label: '90 Tage', days: 90 },
  { label: '6 Monate', days: 180 },
  { label: '1 Jahr', days: 365 },
  { label: 'Gesamt', days: 0 },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtEur(v: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
}

function daysBefore(days: number): string {
  if (days === 0) return ''
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

// ─── Visibility Matrix (Aaron-Präzisierung 09.04.2026) ─────────────────────

function canSee(rolle: UserStatistikRolle, section: 'kuerzung' | 'unfall' | 'gegner' | 'potenziale'): boolean {
  if (rolle === 'admin') return true
  if (rolle === 'kundenbetreuer') return section !== 'potenziale'
  if (rolle === 'leadbearbeiter') return section === 'unfall' || section === 'gegner'
  // SV roles
  if (section === 'potenziale') {
    return ['sv_solo', 'sv_buero_inhaber', 'sv_sub_buero', 'akademie_verwalter', 'akademie_sub_sv', 'community_member'].includes(rolle)
  }
  return true
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function StatistikenClient({
  faelle,
  klassifizierungen,
  benchmarks,
  svNameMap,
  rolle,
  userId,
  leaderboard,
}: {
  faelle: StatistikFall[]
  klassifizierungen: StatistikKlassifizierung[]
  benchmarks: Benchmark[]
  svNameMap: Record<string, string>
  rolle: UserStatistikRolle
  userId: string
  leaderboard: { sv_id: string; faelle_count: number; umsatz_netto: number; rang: number }[]
}) {
  const [zeitraum, setZeitraum] = useState(90)
  const [nurEigene, setNurEigene] = useState(rolle === 'kundenbetreuer')
  const [drillDown, setDrillDown] = useState<{ title: string; items: DrillDownItem[]; summe?: number; berechnetAus?: string } | null>(null)

  const cutoff = daysBefore(zeitraum)

  // Filter faelle by zeitraum and optionally by Kundenberater
  const filtered = useMemo(() => {
    let f = faelle
    if (cutoff) f = f.filter(x => x.created_at >= cutoff)
    if (nurEigene && rolle === 'kundenbetreuer') {
      f = f.filter(x => x.kundenbetreuer_id === userId)
    }
    return f
  }, [faelle, cutoff, nurEigene, rolle, userId])

  // Map klassifizierungen to fall_id for quick lookup
  const klassMap = useMemo(() => {
    const m = new Map<string, StatistikKlassifizierung>()
    for (const k of klassifizierungen) m.set(k.fall_id, k)
    return m
  }, [klassifizierungen])

  // Tooltip style
  const tooltipStyle = {
    contentStyle: { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 12 },
    labelStyle: { color: '#6b7280' },
  }

  // ─── Drill-Down Helper ──────────────────────────────────────────────────

  function openDrillDown(title: string, fallIds: string[], berechnetAus?: string) {
    const items: DrillDownItem[] = fallIds.map(id => {
      const f = faelle.find(x => x.id === id)
      return {
        id,
        label: id.slice(0, 8),
        sublabel: f?.status ?? '',
        betrag: f?.regulierung_betrag ?? undefined,
        datum: f?.created_at,
        link: `/admin/faelle/${id}`,
      }
    })
    const summe = items.reduce((s, i) => s + (i.betrag ?? 0), 0)
    setDrillDown({ title, items, summe: summe > 0 ? summe : undefined, berechnetAus })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEKTION 1: Kürzungs-/Ablehnungsgründe
  // ═══════════════════════════════════════════════════════════════════════════

  const kuerzungData = useMemo(() => {
    const filteredKlass = klassifizierungen.filter(k => {
      const f = faelle.find(x => x.id === k.fall_id)
      if (!f) return false
      if (cutoff && f.created_at < cutoff) return false
      if (nurEigene && rolle === 'kundenbetreuer' && f.kundenbetreuer_id !== userId) return false
      return true
    })

    const byGrund: Record<string, { count: number; summeKuerzung: number; fallIds: string[] }> = {}
    for (const k of filteredKlass) {
      if (!k.kuerzungsgrund) continue
      if (!byGrund[k.kuerzungsgrund]) byGrund[k.kuerzungsgrund] = { count: 0, summeKuerzung: 0, fallIds: [] }
      byGrund[k.kuerzungsgrund].count++
      byGrund[k.kuerzungsgrund].summeKuerzung += Number(k.kuerzung_betrag_netto ?? 0)
      byGrund[k.kuerzungsgrund].fallIds.push(k.fall_id)
    }

    return Object.entries(byGrund)
      .map(([grund, d]) => ({
        grund,
        label: KUERZUNGSGRUND_LABELS[grund] ?? grund,
        count: d.count,
        summeKuerzung: d.summeKuerzung,
        avgKuerzung: d.count > 0 ? Math.round(d.summeKuerzung / d.count) : 0,
        fallIds: d.fallIds,
      }))
      .sort((a, b) => b.summeKuerzung - a.summeKuerzung)
  }, [klassifizierungen, faelle, cutoff, nurEigene, rolle, userId])

  // ═══════════════════════════════════════════════════════════════════════════
  // SEKTION 2: Unfall-Konstellationen
  // ═══════════════════════════════════════════════════════════════════════════

  const unfallData = useMemo(() => {
    const counts: Record<string, { count: number; avgBetrag: number; totalBetrag: number; fallIds: string[] }> = {}
    for (const f of filtered) {
      const k = f.unfall_konstellation ?? 'unbekannt'
      if (!counts[k]) counts[k] = { count: 0, avgBetrag: 0, totalBetrag: 0, fallIds: [] }
      counts[k].count++
      counts[k].totalBetrag += Number(f.gutachten_betrag ?? 0)
      counts[k].fallIds.push(f.id)
    }
    return Object.entries(counts)
      .filter(([k]) => k !== 'unbekannt')
      .map(([k, d]) => ({
        typ: k,
        label: UNFALL_LABELS[k] ?? k,
        count: d.count,
        avgBetrag: d.count > 0 ? Math.round(d.totalBetrag / d.count) : 0,
        fallIds: d.fallIds,
      }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  const unfallTotal = unfallData.reduce((s, d) => s + d.count, 0)

  // ═══════════════════════════════════════════════════════════════════════════
  // SEKTION 3: Unfall mit Gegner
  // ═══════════════════════════════════════════════════════════════════════════

  const gegnerBeteiligteData = useMemo(() => {
    const counts: Record<string, { count: number; fallIds: string[] }> = {}
    for (const f of filtered) {
      const n = f.gegner_anzahl_beteiligte ?? 1
      const label = n >= 3 ? '3+' : String(n)
      if (!counts[label]) counts[label] = { count: 0, fallIds: [] }
      counts[label].count++
      counts[label].fallIds.push(f.id)
    }
    return Object.entries(counts)
      .map(([label, d]) => ({ label, count: d.count, fallIds: d.fallIds }))
      .sort((a, b) => parseInt(a.label) - parseInt(b.label))
  }, [filtered])

  const gegnerFahrzeugData = useMemo(() => {
    const counts: Record<string, { count: number; totalBetrag: number; fallIds: string[] }> = {}
    for (const f of filtered) {
      if (!f.gegner_fahrzeugtyp) continue
      const k = f.gegner_fahrzeugtyp
      if (!counts[k]) counts[k] = { count: 0, totalBetrag: 0, fallIds: [] }
      counts[k].count++
      counts[k].totalBetrag += Number(f.gutachten_betrag ?? 0)
      counts[k].fallIds.push(f.id)
    }
    return Object.entries(counts)
      .map(([k, d]) => ({
        typ: k,
        label: FAHRZEUGTYP_LABELS[k] ?? k,
        count: d.count,
        avgBetrag: d.count > 0 ? Math.round(d.totalBetrag / d.count) : 0,
        fallIds: d.fallIds,
      }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  // ═══════════════════════════════════════════════════════════════════════════
  // SEKTION 4: Potenziale (Branchen-Benchmark)
  // ═══════════════════════════════════════════════════════════════════════════

  const potenzialeData = useMemo(() => {
    // Calculate actual metrics
    const totalFaelle = filtered.length
    const abgeschlossene = filtered.filter(f => f.status === 'abgeschlossen')

    // Avg Bearbeitungsdauer (Tage)
    const bearbeitungsDauern = abgeschlossene
      .filter(f => f.created_at && f.regulierung_am)
      .map(f => (new Date(f.regulierung_am!).getTime() - new Date(f.created_at).getTime()) / 86400000)
      .filter(d => d >= 0 && d < 365)
    const avgBearbeitungsdauer = bearbeitungsDauern.length > 0
      ? Math.round((bearbeitungsDauern.reduce((s, d) => s + d, 0) / bearbeitungsDauern.length) * 10) / 10
      : null

    // Avg Kürzungsquote
    const klassWithKuerzung = klassifizierungen.filter(k => {
      const f = faelle.find(x => x.id === k.fall_id)
      return f && (!cutoff || f.created_at >= cutoff) && k.geltend_gemacht_netto && Number(k.geltend_gemacht_netto) > 0
    })
    const kuerzungsQuote = klassWithKuerzung.length > 0
      ? Math.round(
          (klassWithKuerzung.reduce((s, k) => s + (Number(k.kuerzung_betrag_netto ?? 0) / Number(k.geltend_gemacht_netto!)), 0) /
            klassWithKuerzung.length) * 1000
        ) / 10
      : null

    // Avg Schadenhöhe
    const mitBetrag = filtered.filter(f => f.gutachten_betrag && Number(f.gutachten_betrag) > 0)
    const avgSchadenhoehe = mitBetrag.length > 0
      ? Math.round(mitBetrag.reduce((s, f) => s + Number(f.gutachten_betrag!), 0) / mitBetrag.length)
      : null

    // Avg Gutachten-Zeit (SV zugewiesen → Gutachten eingegangen)
    const gutachtenZeiten = filtered
      .filter(f => f.sv_zugewiesen_am && f.gutachten_eingegangen_am)
      .map(f => (new Date(f.gutachten_eingegangen_am!).getTime() - new Date(f.sv_zugewiesen_am!).getTime()) / 86400000)
      .filter(d => d >= 0 && d < 90)
    const avgGutachtenZeit = gutachtenZeiten.length > 0
      ? Math.round((gutachtenZeiten.reduce((s, d) => s + d, 0) / gutachtenZeiten.length) * 10) / 10
      : null

    // Map to benchmarks
    const metrikMap: Record<string, number | null> = {
      avg_bearbeitungsdauer_tage: avgBearbeitungsdauer,
      avg_kuerzungsquote_prozent: kuerzungsQuote,
      avg_schadenhoehe_eur: avgSchadenhoehe,
      avg_gutachten_zeit_tage: avgGutachtenZeit,
    }

    return benchmarks.map(b => {
      const eigenerWert = metrikMap[b.metrik] ?? null
      let statusLabel = 'Keine Daten'
      let statusColor = 'gray'
      if (eigenerWert != null) {
        // For "lower is better" metrics (duration, Kürzungsquote)
        const lowerIsBetter = b.metrik.includes('dauer') || b.metrik.includes('zeit') || b.metrik.includes('kuerzung')
        const diff = eigenerWert - Number(b.branchen_wert)
        if (lowerIsBetter) {
          if (diff < -1) { statusLabel = 'Besser als Branche'; statusColor = 'green' }
          else if (diff <= 1) { statusLabel = 'Im Schnitt'; statusColor = 'blue' }
          else { statusLabel = 'Verbesserungspotenzial'; statusColor = 'amber' }
        } else {
          if (diff > 1) { statusLabel = 'Besser als Branche'; statusColor = 'green' }
          else if (diff >= -1) { statusLabel = 'Im Schnitt'; statusColor = 'blue' }
          else { statusLabel = 'Verbesserungspotenzial'; statusColor = 'amber' }
        }
      }
      return { ...b, eigenerWert, statusLabel, statusColor, datenpunkte: totalFaelle }
    })
  }, [filtered, klassifizierungen, faelle, cutoff, benchmarks])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Sticky Filter-Bar */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm px-4 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Statistiken</h1>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Zeitraum */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {ZEITRAUM_OPTIONS.map(o => (
                <button
                  key={o.days}
                  onClick={() => setZeitraum(o.days)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    zeitraum === o.days ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {/* Kundenberater Toggle */}
            {rolle === 'kundenbetreuer' && (
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setNurEigene(true)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${nurEigene ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  Eigene Fälle
                </button>
                <button
                  onClick={() => setNurEigene(false)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!nurEigene ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  Alle Fälle
                </button>
              </div>
            )}
            <span className="text-xs text-gray-400">{filtered.length} Fälle</span>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">

          {/* ═══ Sektion 1: Kürzungs-/Ablehnungsgründe ═══ */}
          {canSee(rolle, 'kuerzung') && (
            <ChartCard title="Kürzungs- & Ablehnungsgründe" subtitle="Sortiert nach Kürzungssumme absteigend">
              {kuerzungData.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">Noch keine Regulierungs-Klassifizierungen erfasst</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Bar Chart */}
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={kuerzungData} layout="vertical">
                      <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={v => `${(v / 1000).toFixed(0)}k €`} />
                      <YAxis type="category" dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={160} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => [fmtEur(v), 'Kürzungssumme']} />
                      <Bar dataKey="summeKuerzung" fill={ONDO_BLUE} radius={[0, 6, 6, 0]} cursor="pointer"
                        onClick={(d: { fallIds?: string[]; label?: string }) => {
                          if (d.fallIds) openDrillDown(`Kürzungsgrund: ${d.label}`, d.fallIds, 'regulierungs_klassifizierung.kuerzung_betrag_netto')
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Data Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase">
                          <th className="text-left py-2 px-2">Grund</th>
                          <th className="text-right py-2 px-2">Fälle</th>
                          <th className="text-right py-2 px-2">Summe</th>
                          <th className="text-right py-2 px-2">Ø Kürzung</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kuerzungData.map(d => (
                          <tr key={d.grund} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                            onClick={() => openDrillDown(`Kürzungsgrund: ${d.label}`, d.fallIds, 'regulierungs_klassifizierung.kuerzung_betrag_netto')}>
                            <td className="py-2 px-2 text-gray-800">{d.label}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-gray-600">{d.count}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-gray-800 font-medium">{fmtEur(d.summeKuerzung)}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-gray-600">{fmtEur(d.avgKuerzung)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </ChartCard>
          )}

          {/* ═══ Sektion 2: Unfall-Konstellationen ═══ */}
          {canSee(rolle, 'unfall') && (
            <ChartCard title="Unfall-Konstellationen" subtitle={`${unfallTotal} Fälle mit Unfall-Typ erfasst`}>
              {unfallData.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">Noch keine Unfall-Konstellationen erfasst</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Donut Chart */}
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={unfallData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={120}
                        dataKey="count"
                        nameKey="label"
                        label={({ label, count }) => `${label} (${count})`}
                        labelLine={false}
                        cursor="pointer"
                        onClick={(d: { fallIds?: string[]; label?: string }) => {
                          if (d.fallIds) openDrillDown(`Unfall: ${d.label}`, d.fallIds, 'faelle.unfall_konstellation')
                        }}
                      >
                        {unfallData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Metrics Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase">
                          <th className="text-left py-2 px-2">Konstellation</th>
                          <th className="text-right py-2 px-2">Fälle</th>
                          <th className="text-right py-2 px-2">Anteil</th>
                          <th className="text-right py-2 px-2">Ø Schadenhöhe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unfallData.map(d => (
                          <tr key={d.typ} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                            onClick={() => openDrillDown(`Unfall: ${d.label}`, d.fallIds, 'faelle.unfall_konstellation')}>
                            <td className="py-2 px-2 text-gray-800">{d.label}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-gray-600">{d.count}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-gray-600">{unfallTotal > 0 ? `${Math.round((d.count / unfallTotal) * 100)}%` : '—'}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-gray-800 font-medium">{d.avgBetrag > 0 ? fmtEur(d.avgBetrag) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </ChartCard>
          )}

          {/* ═══ Sektion 3: Unfall mit Gegner ═══ */}
          {canSee(rolle, 'gegner') && (
            <ChartCard title="Unfall mit Gegner" subtitle="Beteiligte & Fahrzeugtypen">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Pie: Anzahl Beteiligte */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 mb-3">Anzahl Beteiligte</h4>
                  {gegnerBeteiligteData.length === 0 ? (
                    <p className="text-gray-400 text-sm py-6 text-center">Keine Daten</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={gegnerBeteiligteData} cx="50%" cy="50%" outerRadius={80} dataKey="count" nameKey="label"
                          label={({ label, count }) => `${label} (${count})`} labelLine={false}
                          cursor="pointer"
                          onClick={(d: { fallIds?: string[]; label?: string }) => {
                            if (d.fallIds) openDrillDown(`Beteiligte: ${d.label}`, d.fallIds, 'faelle.gegner_anzahl_beteiligte')
                          }}>
                          {gegnerBeteiligteData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Bar: Fahrzeugtyp Gegner */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 mb-3">Fahrzeugtyp Gegner</h4>
                  {gegnerFahrzeugData.length === 0 ? (
                    <p className="text-gray-400 text-sm py-6 text-center">Keine Daten</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={gegnerFahrzeugData}>
                        <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="count" fill={ONDO_BLUE} radius={[4, 4, 0, 0]} name="Fälle" cursor="pointer"
                          onClick={(d: { fallIds?: string[]; label?: string }) => {
                            if (d.fallIds) openDrillDown(`Gegner-Fahrzeug: ${d.label}`, d.fallIds, 'faelle.gegner_fahrzeugtyp')
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Insight Box */}
              {gegnerFahrzeugData.length >= 2 && (
                <div className="mt-4 bg-[#4573A2]/5 border border-[#4573A2]/20 rounded-xl p-3">
                  <p className="text-xs text-gray-700">
                    <span className="font-semibold text-[#4573A2]">Insight:</span>{' '}
                    {gegnerFahrzeugData[0].count} Fälle ({Math.round((gegnerFahrzeugData[0].count / filtered.length) * 100)}%) haben {gegnerFahrzeugData[0].label} als Gegner.
                    {gegnerFahrzeugData.length > 1 && ` ${gegnerFahrzeugData[1].label}-Fälle haben durchschnittlich ${fmtEur(gegnerFahrzeugData[1].avgBetrag)} Schadenhöhe vs. ${fmtEur(gegnerFahrzeugData[0].avgBetrag)} bei ${gegnerFahrzeugData[0].label}.`}
                  </p>
                </div>
              )}
            </ChartCard>
          )}

          {/* ═══ Sektion 4: Potenziale (Branchen-Benchmark) ═══ */}
          {canSee(rolle, 'potenziale') && (
            <ChartCard title="Potenziale — Branchen-Benchmark Vergleich" subtitle="Eigene Werte vs. Branchendurchschnitt">
              {potenzialeData.length === 0 ? (
                <p className="text-gray-400 text-sm py-8 text-center">Keine Benchmark-Daten vorhanden</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {potenzialeData.map(b => (
                    <div key={b.metrik} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-800">{b.beschreibung}</h4>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          b.statusColor === 'green' ? 'bg-green-100 text-green-700' :
                          b.statusColor === 'amber' ? 'bg-amber-100 text-amber-700' :
                          b.statusColor === 'blue' ? 'bg-[#4573A2]/10 text-[#4573A2]' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {b.statusLabel}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-3 mb-2">
                        <span className="text-2xl font-bold text-gray-900 tabular-nums">
                          {b.eigenerWert != null
                            ? b.einheit === 'EUR' ? fmtEur(b.eigenerWert) : `${b.eigenerWert}${b.einheit === 'Prozent' ? '%' : ''}`
                            : '—'}
                        </span>
                        <span className="text-sm text-gray-400">
                          vs. {b.einheit === 'EUR' ? fmtEur(Number(b.branchen_wert)) : `${b.branchen_wert}${b.einheit === 'Prozent' ? '%' : ''}`} Branche
                        </span>
                      </div>
                      {/* Progress bar */}
                      {b.eigenerWert != null && (
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              b.statusColor === 'green' ? 'bg-green-500' :
                              b.statusColor === 'amber' ? 'bg-amber-500' :
                              'bg-[#4573A2]'
                            }`}
                            style={{ width: `${Math.min(Math.max((b.eigenerWert / Number(b.branchen_wert)) * 50, 5), 100)}%` }}
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-gray-400">Quelle: {b.quelle ?? 'k.A.'}</span>
                        <span className="text-[10px] text-gray-400">{b.datenpunkte} Fälle</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>
          )}

          {/* Community Leaderboard */}
          {rolle === 'community_member' && leaderboard.length > 0 && (
            <ChartCard title="Community Leaderboard">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase">
                      <th className="text-left py-2 px-2">Rang</th>
                      <th className="text-left py-2 px-2">SV</th>
                      <th className="text-right py-2 px-2">Fälle</th>
                      <th className="text-right py-2 px-2">Umsatz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map(l => (
                      <tr key={l.sv_id} className="border-b border-gray-100">
                        <td className="py-2 px-2 text-gray-800 font-medium">#{l.rang}</td>
                        <td className="py-2 px-2 text-gray-700">{svNameMap[l.sv_id] ?? l.sv_id.slice(0, 8)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-gray-600">{l.faelle_count}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-gray-800 font-medium">{fmtEur(Number(l.umsatz_netto))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}

        </div>
      </main>

      {/* Drill-Down Modal */}
      {drillDown && (
        <DrillDownModal
          title={drillDown.title}
          summe={drillDown.summe}
          berechnetAus={drillDown.berechnetAus}
          items={drillDown.items}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  )
}

// ─── Chart Card ─────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
