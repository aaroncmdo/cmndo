'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line,
} from 'recharts'
import DrillDownModal from '@/components/admin/DrillDownModal'
import PageHeader from '@/components/shared/PageHeader'
import type { DrillDownItem } from '@/lib/analytics'
import type {
  UserStatistikRolle,
  StatistikFall,
  StatistikKlassifizierung,
  Benchmark,
} from './page'

// ─── Constants ──────────────────────────────────────────────────────────────

const ONDO_BLUE = '#4573A2'

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
  pkw: 'PKW', lkw: 'LKW', transporter: 'Transporter', motorrad: 'Motorrad',
  fahrrad: 'Fahrrad', fussgaenger: 'Fußgänger', bus: 'Bus', sonstiges: 'Sonstiges',
}

const CHART_COLORS = [ONDO_BLUE, '#1E3A5F', '#7BA3CC', '#2d5f8a', '#5a9bd5', '#3b6d99', '#8fb8de', '#14375a']

const ZEITRAUM_OPTIONS = [
  { label: '30 Tage', days: 30 },
  { label: '90 Tage', days: 90 },
  { label: '6 Monate', days: 180 },
  { label: '1 Jahr', days: 365 },
  { label: 'Gesamt', days: 0 },
]

const WAS_TUN_TIPS: Record<string, string> = {
  avg_bearbeitungsdauer_tage: 'Prüfe SVs mit Wartezeiten > 5 Tage, sprich mit ihnen über Kapazitätsplanung. Engpässe bei Terminvergabe identifizieren.',
  avg_kuerzungsquote_prozent: 'Häufige Kürzungsgründe analysieren (Sektion oben). Gutachten-Qualität mit SVs besprechen. Versicherer mit höchster Quote gezielt adressieren.',
  avg_schadenhoehe_eur: 'Niedrigere Schadenhöhe kann auf Bagatell-Fälle hinweisen. Marketing-Qualifizierung prüfen — werden die richtigen Leads angezogen?',
  avg_gutachten_zeit_tage: 'SVs mit langer Gutachten-Zeit identifizieren. Automatische Erinnerungen (SV-04) prüfen. Kapazitätsplanung optimieren.',
  avg_anteil_klare_haftung_prozent: 'Höherer Anteil klarer Haftung vereinfacht Regulierung. Lead-Qualifizierung optimieren für Fälle mit eindeutiger Schuldfrage.',
  konversion_lead_zu_fall_prozent: 'FlowLink Completion Rate prüfen. Telefonische Nachfass-Strategie für abgebrochene Leads. SA-Unterschrift-Hürde analysieren.',
}

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

// ─── Visibility Matrix ─────────────────────────────────────────────────────

function canSee(rolle: UserStatistikRolle, section: 'kuerzung' | 'unfall' | 'gegner' | 'potenziale'): boolean {
  if (rolle === 'admin') return true
  if (rolle === 'kundenbetreuer') return section !== 'potenziale'
  if (rolle === 'dispatch') return section === 'unfall' || section === 'gegner'
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
  totalLeads,
}: {
  faelle: StatistikFall[]
  klassifizierungen: StatistikKlassifizierung[]
  benchmarks: Benchmark[]
  svNameMap: Record<string, string>
  rolle: UserStatistikRolle
  userId: string
  leaderboard: { sv_id: string; faelle_count: number; umsatz_netto: number; rang: number }[]
  totalLeads: number
}) {
  const [zeitraum, setZeitraum] = useState(90)
  const [nurEigene, setNurEigene] = useState(rolle === 'kundenbetreuer' || rolle === 'dispatch')
  const [filterSv, setFilterSv] = useState('')
  const [filterVersicherer, setFilterVersicherer] = useState('')
  const [filterPlz, setFilterPlz] = useState('')
  const [drillDown, setDrillDown] = useState<{ title: string; items: DrillDownItem[]; summe?: number; berechnetAus?: string } | null>(null)
  const [wasTunOpen, setWasTunOpen] = useState<string | null>(null)

  const cutoff = daysBefore(zeitraum)

  // Unique filter options
  const svOptions = useMemo(() => Object.entries(svNameMap).sort((a, b) => a[1].localeCompare(b[1])), [svNameMap])
  const versichererOptions = useMemo(() => {
    const set = new Set<string>()
    for (const k of klassifizierungen) if (k.versicherer) set.add(k.versicherer)
    return Array.from(set).sort()
  }, [klassifizierungen])

  // Filter faelle
  const filtered = useMemo(() => {
    let f = faelle
    if (cutoff) f = f.filter(x => x.created_at >= cutoff)
    if (nurEigene && rolle === 'kundenbetreuer') {
      f = f.filter(x => x.kundenbetreuer_id === userId)
    }
    if (nurEigene && rolle === 'dispatch') {
      f = f.filter(x => x.dispatch_id === userId)
    }
    if (filterSv) f = f.filter(x => x.sv_id === filterSv)
    if (filterPlz) f = f.filter(x => x.schadens_plz?.startsWith(filterPlz))
    return f
  }, [faelle, cutoff, nurEigene, rolle, userId, filterSv, filterPlz])

  // Filter klassifizierungen by versicherer + time
  const filteredKlass = useMemo(() => {
    return klassifizierungen.filter(k => {
      const f = faelle.find(x => x.id === k.fall_id)
      if (!f) return false
      if (cutoff && f.created_at < cutoff) return false
      if (nurEigene && rolle === 'kundenbetreuer' && f.kundenbetreuer_id !== userId) return false
      if (nurEigene && rolle === 'dispatch' && f.dispatch_id !== userId) return false
      if (filterSv && f.sv_id !== filterSv) return false
      if (filterPlz && !f.schadens_plz?.startsWith(filterPlz)) return false
      if (filterVersicherer && k.versicherer !== filterVersicherer) return false
      return true
    })
  }, [klassifizierungen, faelle, cutoff, nurEigene, rolle, userId, filterSv, filterPlz, filterVersicherer])

  // Klassifizierung map
  const klassMap = useMemo(() => {
    const m = new Map<string, StatistikKlassifizierung>()
    for (const k of klassifizierungen) m.set(k.fall_id, k)
    return m
  }, [klassifizierungen])

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
        link: `/faelle/${id}`,
      }
    })
    const summe = items.reduce((s, i) => s + (i.betrag ?? 0), 0)
    setDrillDown({ title, items, summe: summe > 0 ? summe : undefined, berechnetAus })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEKTION 1: Kürzungs-/Ablehnungsgründe
  // ═══════════════════════════════════════════════════════════════════════════

  const kuerzungData = useMemo(() => {
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
  }, [filteredKlass])

  // ═══════════════════════════════════════════════════════════════════════════
  // SEKTION 2: Unfall-Konstellationen
  // ═══════════════════════════════════════════════════════════════════════════

  const unfallData = useMemo(() => {
    const counts: Record<string, { count: number; totalBetrag: number; fallIds: string[]; dauern: number[]; mitLead: number }> = {}
    for (const f of filtered) {
      const k = f.unfall_konstellation
      if (!k) continue
      if (!counts[k]) counts[k] = { count: 0, totalBetrag: 0, fallIds: [], dauern: [], mitLead: 0 }
      counts[k].count++
      counts[k].totalBetrag += Number(f.gutachten_betrag ?? 0)
      counts[k].fallIds.push(f.id)
      if (f.regulierung_am) {
        const d = (new Date(f.regulierung_am).getTime() - new Date(f.created_at).getTime()) / 86400000
        if (d >= 0 && d < 365) counts[k].dauern.push(d)
      }
      if (f.lead_id) counts[k].mitLead++
    }
    return Object.entries(counts)
      .map(([k, d]) => ({
        typ: k,
        label: UNFALL_LABELS[k] ?? k,
        count: d.count,
        avgBetrag: d.count > 0 ? Math.round(d.totalBetrag / d.count) : 0,
        avgDauer: d.dauern.length > 0 ? Math.round(d.dauern.reduce((s, v) => s + v, 0) / d.dauern.length) : null,
        konversionPct: d.count > 0 ? Math.round((d.mitLead / d.count) * 100) : null,
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
        typ: k, label: FAHRZEUGTYP_LABELS[k] ?? k, count: d.count,
        avgBetrag: d.count > 0 ? Math.round(d.totalBetrag / d.count) : 0, fallIds: d.fallIds,
      }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  // Wer-trifft-Wen Heatmap Matrix
  const heatmapData = useMemo(() => {
    const typLabels = Object.keys(FAHRZEUGTYP_LABELS)
    const matrix: Record<string, Record<string, { count: number; avgBetrag: number; total: number }>> = {}
    for (const eigen of typLabels) {
      matrix[eigen] = {}
      for (const gegner of typLabels) matrix[eigen][gegner] = { count: 0, avgBetrag: 0, total: 0 }
    }
    let maxCount = 0
    for (const f of filtered) {
      const eigen = f.fahrzeug_typ ?? 'pkw'
      const gegner = f.gegner_fahrzeugtyp
      if (!gegner || !matrix[eigen]) continue
      if (!matrix[eigen][gegner]) matrix[eigen][gegner] = { count: 0, avgBetrag: 0, total: 0 }
      matrix[eigen][gegner].count++
      matrix[eigen][gegner].total += Number(f.gutachten_betrag ?? 0)
      if (matrix[eigen][gegner].count > maxCount) maxCount = matrix[eigen][gegner].count
    }
    // Calc averages
    for (const eigen of typLabels) {
      for (const gegner of typLabels) {
        const c = matrix[eigen][gegner]
        if (c.count > 0) c.avgBetrag = Math.round(c.total / c.count)
      }
    }
    return { matrix, typLabels, maxCount }
  }, [filtered])

  // ═══════════════════════════════════════════════════════════════════════════
  // SEKTION 4: Potenziale (Branchen-Benchmark) mit 6-Monats-Trend
  // ═══════════════════════════════════════════════════════════════════════════

  const months = last6Months()

  const potenzialeData = useMemo(() => {
    const totalFaelle = filtered.length
    const abgeschlossene = filtered.filter(f => f.status === 'abgeschlossen')

    // Avg Bearbeitungsdauer
    const bearbeitungsDauern = abgeschlossene
      .filter(f => f.created_at && f.regulierung_am)
      .map(f => (new Date(f.regulierung_am!).getTime() - new Date(f.created_at).getTime()) / 86400000)
      .filter(d => d >= 0 && d < 365)
    const avgBearbeitungsdauer = bearbeitungsDauern.length > 0
      ? Math.round((bearbeitungsDauern.reduce((s, d) => s + d, 0) / bearbeitungsDauern.length) * 10) / 10
      : null

    // Avg Kürzungsquote
    const klassWithKuerzung = filteredKlass.filter(k => k.geltend_gemacht_netto && Number(k.geltend_gemacht_netto) > 0)
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

    // Avg Gutachten-Zeit
    const gutachtenZeiten = filtered
      .filter(f => f.sv_zugewiesen_am && f.gutachten_eingegangen_am)
      .map(f => (new Date(f.gutachten_eingegangen_am!).getTime() - new Date(f.sv_zugewiesen_am!).getTime()) / 86400000)
      .filter(d => d >= 0 && d < 90)
    const avgGutachtenZeit = gutachtenZeiten.length > 0
      ? Math.round((gutachtenZeiten.reduce((s, d) => s + d, 0) / gutachtenZeiten.length) * 10) / 10
      : null

    // Konversionsrate Lead → Fall
    const faelleMitLead = filtered.filter(f => f.lead_id).length
    const konversionPct = totalLeads > 0 ? Math.round((faelleMitLead / totalLeads) * 1000) / 10 : null

    const metrikMap: Record<string, number | null> = {
      avg_bearbeitungsdauer_tage: avgBearbeitungsdauer,
      avg_kuerzungsquote_prozent: kuerzungsQuote,
      avg_schadenhoehe_eur: avgSchadenhoehe,
      avg_gutachten_zeit_tage: avgGutachtenZeit,
      konversion_lead_zu_fall_prozent: konversionPct,
    }

    // Top 3 SVs per metric for insight text
    function getTop3SvsForMetrik(metrik: string): string[] {
      if (metrik === 'avg_bearbeitungsdauer_tage' || metrik === 'avg_gutachten_zeit_tage') {
        const svDauern: Record<string, { total: number; count: number }> = {}
        for (const f of filtered) {
          if (!f.sv_id) continue
          const from = metrik === 'avg_bearbeitungsdauer_tage' ? f.created_at : f.sv_zugewiesen_am
          const to = metrik === 'avg_bearbeitungsdauer_tage' ? f.regulierung_am : f.gutachten_eingegangen_am
          if (!from || !to) continue
          const d = (new Date(to).getTime() - new Date(from).getTime()) / 86400000
          if (d < 0 || d > 365) continue
          if (!svDauern[f.sv_id]) svDauern[f.sv_id] = { total: 0, count: 0 }
          svDauern[f.sv_id].total += d
          svDauern[f.sv_id].count++
        }
        return Object.entries(svDauern)
          .map(([id, d]) => ({ id, avg: d.total / d.count }))
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 3)
          .map(s => svNameMap[s.id] ?? s.id.slice(0, 8))
      }
      return []
    }

    // 6-month trend per metric
    function calcTrend(metrik: string): { month: string; value: number }[] {
      return months.map(m => {
        const mFaelle = faelle.filter(f => monthKey(f.created_at) === m)
        if (metrik === 'avg_bearbeitungsdauer_tage') {
          const ds = mFaelle.filter(f => f.regulierung_am).map(f => (new Date(f.regulierung_am!).getTime() - new Date(f.created_at).getTime()) / 86400000).filter(d => d >= 0 && d < 365)
          return { month: monthLabel(m), value: ds.length > 0 ? Math.round(ds.reduce((s, d) => s + d, 0) / ds.length * 10) / 10 : 0 }
        }
        if (metrik === 'avg_schadenhoehe_eur') {
          const mb = mFaelle.filter(f => f.gutachten_betrag && Number(f.gutachten_betrag) > 0)
          return { month: monthLabel(m), value: mb.length > 0 ? Math.round(mb.reduce((s, f) => s + Number(f.gutachten_betrag!), 0) / mb.length) : 0 }
        }
        if (metrik === 'avg_gutachten_zeit_tage') {
          const gt = mFaelle.filter(f => f.sv_zugewiesen_am && f.gutachten_eingegangen_am).map(f => (new Date(f.gutachten_eingegangen_am!).getTime() - new Date(f.sv_zugewiesen_am!).getTime()) / 86400000).filter(d => d >= 0 && d < 90)
          return { month: monthLabel(m), value: gt.length > 0 ? Math.round(gt.reduce((s, d) => s + d, 0) / gt.length * 10) / 10 : 0 }
        }
        return { month: monthLabel(m), value: 0 }
      })
    }

    return benchmarks.map(b => {
      const eigenerWert = metrikMap[b.metrik] ?? null
      let statusLabel = 'Keine Daten'
      let statusColor = 'gray'
      if (eigenerWert != null) {
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
      // Dynamic insight text
      let insight = ''
      if (eigenerWert != null && statusColor === 'amber') {
        const diff = Math.abs(eigenerWert - Number(b.branchen_wert))
        const unit = b.einheit === 'EUR' ? fmtEur(diff) : b.einheit === 'Prozent' ? `${diff.toFixed(1)}%` : `${diff.toFixed(1)} ${b.einheit}`
        insight = `Du liegst ${unit} ${b.metrik.includes('dauer') || b.metrik.includes('zeit') || b.metrik.includes('kuerzung') ? 'über' : 'unter'} dem Branchenschnitt.`
        const top3 = getTop3SvsForMetrik(b.metrik)
        if (top3.length > 0) insight += ` Top 3 SVs: ${top3.join(', ')}.`
      }

      return { ...b, eigenerWert, statusLabel, statusColor, datenpunkte: totalFaelle, trend: calcTrend(b.metrik), insight }
    })
  }, [filtered, filteredKlass, faelle, benchmarks, months, totalLeads, svNameMap])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Sticky Filter-Bar */}
      <header className="sticky top-0 z-10 bg-white border-b border-claimondo-border shadow-sm px-4 py-3">
        <div className="max-w-[1600px] mx-auto space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <PageHeader title="Statistiken" />
            <div className="flex items-center gap-3 flex-wrap">
              {/* Zeitraum */}
              <div className="flex bg-[#f8f9fb] rounded-lg p-0.5">
                {ZEITRAUM_OPTIONS.map(o => (
                  <button key={o.days} onClick={() => setZeitraum(o.days)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${zeitraum === o.days ? 'bg-white text-claimondo-navy shadow-sm' : 'text-claimondo-ondo hover:text-claimondo-navy'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              {/* Kundenberater / Leadabarbeiter Toggle */}
              {(rolle === 'kundenbetreuer' || rolle === 'dispatch') && (
                <div className="flex bg-[#f8f9fb] rounded-lg p-0.5">
                  <button onClick={() => setNurEigene(true)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${nurEigene ? 'bg-white text-claimondo-navy shadow-sm' : 'text-claimondo-ondo'}`}>
                    Eigene
                  </button>
                  <button onClick={() => setNurEigene(false)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!nurEigene ? 'bg-white text-claimondo-navy shadow-sm' : 'text-claimondo-ondo'}`}>
                    {rolle === 'dispatch' ? 'Team' : 'Alle Fälle'}
                  </button>
                </div>
              )}
              <span className="text-xs text-claimondo-ondo/70">{filtered.length} Fälle</span>
            </div>
          </div>
          {/* Extended Filters Row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* SV Filter */}
            {(rolle === 'admin' || rolle === 'sv_buero_inhaber' || rolle === 'akademie_verwalter') && svOptions.length > 1 && (
              <select value={filterSv} onChange={e => setFilterSv(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-claimondo-border rounded-lg bg-white focus:outline-none focus:border-[#4573A2]">
                <option value="">Alle SVs</option>
                {svOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            )}
            {/* Versicherer Filter */}
            {versichererOptions.length > 0 && (
              <select value={filterVersicherer} onChange={e => setFilterVersicherer(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-claimondo-border rounded-lg bg-white focus:outline-none focus:border-[#4573A2]">
                <option value="">Alle Versicherer</option>
                {versichererOptions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
            {/* Region (PLZ) Filter */}
            <input type="text" value={filterPlz} onChange={e => setFilterPlz(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="PLZ-Region" maxLength={5}
              className="w-24 px-2.5 py-1.5 text-xs border border-claimondo-border rounded-lg bg-white focus:outline-none focus:border-[#4573A2]" />
            {(filterSv || filterVersicherer || filterPlz) && (
              <button onClick={() => { setFilterSv(''); setFilterVersicherer(''); setFilterPlz('') }}
                className="text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo">Filter zurücksetzen</button>
            )}
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
                <p className="text-claimondo-ondo/70 text-sm py-8 text-center">Noch keine Regulierungs-Klassifizierungen erfasst</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={kuerzungData} layout="vertical">
                      <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={v => `${(v / 1000).toFixed(0)}k €`} />
                      <YAxis type="category" dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={160} />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip {...tooltipStyle} formatter={((v: number) => [fmtEur(v), 'Kürzungssumme']) as any} />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Bar dataKey="summeKuerzung" fill={ONDO_BLUE} radius={[0, 6, 6, 0]} cursor="pointer" onClick={((d: { fallIds?: string[]; label?: string }) => d.fallIds && openDrillDown(`Kürzungsgrund: ${d.label}`, d.fallIds, 'regulierungs_klassifizierung.kuerzung_betrag_netto')) as any} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-claimondo-border text-[10px] text-claimondo-ondo uppercase">
                        <th className="text-left py-2 px-2">Grund</th><th className="text-right py-2 px-2">Fälle</th>
                        <th className="text-right py-2 px-2">Summe</th><th className="text-right py-2 px-2">Ø Kürzung</th>
                      </tr></thead>
                      <tbody>
                        {kuerzungData.map(d => (
                          <tr key={d.grund} className="border-b border-claimondo-border hover:bg-[#f8f9fb] cursor-pointer"
                            onClick={() => openDrillDown(`Kürzungsgrund: ${d.label}`, d.fallIds, 'regulierungs_klassifizierung.kuerzung_betrag_netto')}>
                            <td className="py-2 px-2 text-claimondo-navy">{d.label}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-claimondo-ondo">{d.count}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-claimondo-navy font-medium">{fmtEur(d.summeKuerzung)}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-claimondo-ondo">{fmtEur(d.avgKuerzung)}</td>
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
                <p className="text-claimondo-ondo/70 text-sm py-8 text-center">Noch keine Unfall-Konstellationen erfasst</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={unfallData} cx="50%" cy="50%" innerRadius={70} outerRadius={120}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        dataKey="count" nameKey="label" label={(({ label, count }: any) => `${label} (${count})`) as any} labelLine={false}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        cursor="pointer" onClick={((d: { fallIds?: string[]; label?: string }) => d.fallIds && openDrillDown(`Unfall: ${d.label}`, d.fallIds, 'faelle.unfall_konstellation')) as any}>
                        {unfallData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-claimondo-border text-[10px] text-claimondo-ondo uppercase">
                        <th className="text-left py-2 px-2">Konstellation</th><th className="text-right py-2 px-2">Fälle</th>
                        <th className="text-right py-2 px-2">Anteil</th><th className="text-right py-2 px-2">Ø Schadenhöhe</th>
                        <th className="text-right py-2 px-2">Ø Dauer</th><th className="text-right py-2 px-2">Konversion</th>
                      </tr></thead>
                      <tbody>
                        {unfallData.map(d => (
                          <tr key={d.typ} className="border-b border-claimondo-border hover:bg-[#f8f9fb] cursor-pointer"
                            onClick={() => openDrillDown(`Unfall: ${d.label}`, d.fallIds, 'faelle.unfall_konstellation')}>
                            <td className="py-2 px-2 text-claimondo-navy">{d.label}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-claimondo-ondo">{d.count}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-claimondo-ondo">{unfallTotal > 0 ? `${Math.round((d.count / unfallTotal) * 100)}%` : '—'}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-claimondo-navy font-medium">{d.avgBetrag > 0 ? fmtEur(d.avgBetrag) : '—'}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-claimondo-ondo">{d.avgDauer != null ? `${d.avgDauer} T` : '—'}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-claimondo-ondo">{d.konversionPct != null ? `${d.konversionPct}%` : '—'}</td>
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
            <ChartCard title="Unfall mit Gegner" subtitle="Beteiligte, Fahrzeugtypen & Wer-trifft-Wen">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div>
                  <h4 className="text-xs font-medium text-claimondo-ondo mb-3">Anzahl Beteiligte</h4>
                  {gegnerBeteiligteData.length === 0 ? (
                    <p className="text-claimondo-ondo/70 text-sm py-6 text-center">Keine Daten</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={gegnerBeteiligteData} cx="50%" cy="50%" outerRadius={80} dataKey="count" nameKey="label"
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          label={(({ label, count }: any) => `${label} (${count})`) as any} labelLine={false} cursor="pointer"
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          onClick={((d: { fallIds?: string[]; label?: string }) => d.fallIds && openDrillDown(`Beteiligte: ${d.label}`, d.fallIds, 'faelle.gegner_anzahl_beteiligte')) as any}>
                          {gegnerBeteiligteData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip {...tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-medium text-claimondo-ondo mb-3">Fahrzeugtyp Gegner</h4>
                  {gegnerFahrzeugData.length === 0 ? (
                    <p className="text-claimondo-ondo/70 text-sm py-6 text-center">Keine Daten</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={gegnerFahrzeugData}>
                        <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="count" fill={ONDO_BLUE} radius={[4, 4, 0, 0]} name="Fälle" cursor="pointer"
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          onClick={((d: { fallIds?: string[]; label?: string }) => d.fallIds && openDrillDown(`Gegner-Fahrzeug: ${d.label}`, d.fallIds, 'faelle.gegner_fahrzeugtyp')) as any} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Wer-trifft-Wen Heatmap Matrix */}
              {heatmapData.maxCount > 0 && (
                <div className="mt-5">
                  <h4 className="text-xs font-medium text-claimondo-ondo mb-3">Wer-trifft-Wen Matrix (Eigenes Fahrzeug vs. Gegner)</h4>
                  <div className="overflow-x-auto">
                    <table className="text-[10px]">
                      <thead>
                        <tr>
                          <th className="py-1.5 px-2 text-left text-claimondo-ondo font-medium">Eigenes ↓ \ Gegner →</th>
                          {heatmapData.typLabels.map(t => (
                            <th key={t} className="py-1.5 px-2 text-center text-claimondo-ondo font-medium">{FAHRZEUGTYP_LABELS[t]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {heatmapData.typLabels.map(eigen => (
                          <tr key={eigen}>
                            <td className="py-1.5 px-2 text-claimondo-navy font-medium">{FAHRZEUGTYP_LABELS[eigen]}</td>
                            {heatmapData.typLabels.map(gegner => {
                              const cell = heatmapData.matrix[eigen]?.[gegner]
                              const count = cell?.count ?? 0
                              const intensity = heatmapData.maxCount > 0 ? count / heatmapData.maxCount : 0
                              return (
                                <td key={gegner} className="py-1.5 px-2 text-center tabular-nums"
                                  style={{ backgroundColor: count > 0 ? `rgba(69, 115, 162, ${0.1 + intensity * 0.7})` : 'transparent', color: intensity > 0.5 ? '#fff' : '#374151' }}
                                  title={count > 0 ? `${count} Fälle, Ø ${fmtEur(cell?.avgBetrag ?? 0)}` : ''}>
                                  {count > 0 ? count : '·'}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Insight Box */}
              {gegnerFahrzeugData.length >= 2 && (
                <div className="mt-4 bg-[#4573A2]/5 border border-[#4573A2]/20 rounded-xl p-3">
                  <p className="text-xs text-claimondo-navy">
                    <span className="font-semibold text-[#4573A2]">Insight:</span>{' '}
                    {gegnerFahrzeugData[0].count} Fälle ({Math.round((gegnerFahrzeugData[0].count / filtered.length) * 100)}%) haben {gegnerFahrzeugData[0].label} als Gegner.
                    {gegnerFahrzeugData.length > 1 && ` ${gegnerFahrzeugData[1].label}-Fälle haben durchschnittlich ${fmtEur(gegnerFahrzeugData[1].avgBetrag)} Schadenhöhe vs. ${fmtEur(gegnerFahrzeugData[0].avgBetrag)} bei ${gegnerFahrzeugData[0].label}.`}
                  </p>
                </div>
              )}
            </ChartCard>
          )}

          {/* ═══ Sektion 4: Potenziale ═══ */}
          {canSee(rolle, 'potenziale') && (
            <ChartCard title="Potenziale — Branchen-Benchmark Vergleich" subtitle="Eigene Werte vs. Branchendurchschnitt">
              {potenzialeData.length === 0 ? (
                <p className="text-claimondo-ondo/70 text-sm py-8 text-center">Keine Benchmark-Daten vorhanden</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {potenzialeData.map(b => (
                    <div key={b.metrik} className="bg-[#f8f9fb] border border-claimondo-border rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-medium text-claimondo-navy pr-2">{b.beschreibung}</h4>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          b.statusColor === 'green' ? 'bg-green-100 text-green-700' :
                          b.statusColor === 'amber' ? 'bg-amber-100 text-amber-700' :
                          b.statusColor === 'blue' ? 'bg-[#4573A2]/10 text-[#4573A2]' :
                          'bg-[#f8f9fb] text-claimondo-ondo'
                        }`}>
                          {b.statusLabel}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-3 mb-2">
                        <span className="text-2xl font-bold text-claimondo-navy tabular-nums">
                          {b.eigenerWert != null
                            ? b.einheit === 'EUR' ? fmtEur(b.eigenerWert) : `${b.eigenerWert}${b.einheit === 'Prozent' ? '%' : ''}`
                            : '—'}
                        </span>
                        <span className="text-sm text-claimondo-ondo/70">
                          vs. {b.einheit === 'EUR' ? fmtEur(Number(b.branchen_wert)) : `${b.branchen_wert}${b.einheit === 'Prozent' ? '%' : ''}`} Branche
                        </span>
                      </div>

                      {/* Mini Trend Sparkline (6 Monate) */}
                      {b.trend.some(t => t.value > 0) && (
                        <div className="mb-2">
                          <ResponsiveContainer width="100%" height={40}>
                            <LineChart data={b.trend}>
                              <Line type="monotone" dataKey="value" stroke={ONDO_BLUE} strokeWidth={1.5} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* Progress bar */}
                      {b.eigenerWert != null && (
                        <div className="h-2 bg-claimondo-border rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${
                            b.statusColor === 'green' ? 'bg-green-500' : b.statusColor === 'amber' ? 'bg-amber-500' : 'bg-[#4573A2]'
                          }`} style={{ width: `${Math.min(Math.max((b.eigenerWert / Number(b.branchen_wert)) * 50, 5), 100)}%` }} />
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-claimondo-ondo/70">Quelle: {b.quelle ?? 'k.A.'}</span>
                        <span className="text-[10px] text-claimondo-ondo/70">{b.datenpunkte} Fälle</span>
                      </div>

                      {/* Dynamic Insight Text */}
                      {b.insight && (
                        <p className="text-[11px] text-claimondo-ondo mt-2 leading-relaxed italic">{b.insight}</p>
                      )}

                      {/* Was tun? Tooltip */}
                      {b.statusColor === 'amber' && WAS_TUN_TIPS[b.metrik] && (
                        <div className="mt-2">
                          <button onClick={() => setWasTunOpen(wasTunOpen === b.metrik ? null : b.metrik)}
                            className="text-[10px] text-amber-600 hover:text-amber-700 font-medium">
                            {wasTunOpen === b.metrik ? 'Schließen' : 'Was tun?'}
                          </button>
                          {wasTunOpen === b.metrik && (
                            <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2">
                              <p className="text-[11px] text-amber-800 leading-relaxed">{WAS_TUN_TIPS[b.metrik]}</p>
                            </div>
                          )}
                        </div>
                      )}
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
                  <thead><tr className="border-b border-claimondo-border text-[10px] text-claimondo-ondo uppercase">
                    <th className="text-left py-2 px-2">Rang</th><th className="text-left py-2 px-2">SV</th>
                    <th className="text-right py-2 px-2">Fälle</th><th className="text-right py-2 px-2">Umsatz</th>
                  </tr></thead>
                  <tbody>
                    {leaderboard.map(l => (
                      <tr key={l.sv_id} className="border-b border-claimondo-border">
                        <td className="py-2 px-2 text-claimondo-navy font-medium">#{l.rang}</td>
                        <td className="py-2 px-2 text-claimondo-navy">{svNameMap[l.sv_id] ?? l.sv_id.slice(0, 8)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-claimondo-ondo">{l.faelle_count}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-claimondo-navy font-medium">{fmtEur(Number(l.umsatz_netto))}</td>
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
        <DrillDownModal title={drillDown.title} summe={drillDown.summe} berechnetAus={drillDown.berechnetAus}
          items={drillDown.items} onClose={() => setDrillDown(null)} />
      )}
    </div>
  )
}

// ─── Chart Card ─────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="glass-light border border-claimondo-border rounded-ios-md p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-claimondo-navy">{title}</h2>
        {subtitle && <p className="text-xs text-claimondo-ondo/70 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
