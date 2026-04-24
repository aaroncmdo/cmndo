'use client'

import Link from 'next/link'
import { BarChart3Icon, BriefcaseIcon, TrophyIcon, GiftIcon, ClockIcon, PhoneIcon, VideoIcon, AlertTriangleIcon, CalendarIcon } from 'lucide-react'

type Perf = { monat: string; jahr: number; leads_qualifiziert: number; leads_konvertiert: number; faelle_abgeschlossen: number; aktive_faelle: number; umsatz_generiert: number }
type Incentive = { id: string; titel: string; beschreibung: string | null; kategorie: string; typ: string; bedingung: string; wert: number }
type TimelineItem = { zeit: string; typ: string; label: string; detail: string; color: string; link?: string; meetLink?: string }

const MEDAL = ['text-amber-300', 'text-claimondo-ondo', 'text-orange-400']

const TL_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  telefon: { bg: 'bg-claimondo-ondo/20', text: 'text-claimondo-shield', icon: <PhoneIcon className="w-4 h-4" /> },
  video: { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: <VideoIcon className="w-4 h-4" /> },
  task: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: <AlertTriangleIcon className="w-4 h-4" /> },
  gutachter: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: <CalendarIcon className="w-4 h-4" /> },
}

export default function PerformanceClient({ profile, stats, performanceHistory, incentives, leaderboard, monatLabel, userId, timeline, tagesSummary }: {
  profile: { vorname: string | null; nachname: string | null; kategorie: string | null; kapazitaet_max: number | null }
  stats: { leadsTotal: number; leadsKonv: number; aktiveFaelle: number; abgeschlossen: number; isDispatch: boolean }
  performanceHistory: Perf[]
  incentives: Incentive[]
  leaderboard: { id: string; name: string; value: number }[]
  monatLabel: string
  userId: string
  timeline?: TimelineItem[]
  tagesSummary?: { termine: number; offeneTasks: number; ueberfaellig: number }
}) {
  const name = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || '—'
  const fmt = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
  const myRank = leaderboard.findIndex(l => l.id === userId) + 1

  return (
    <div className="py-8"><div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-claimondo-navy flex items-center gap-2"><BarChart3Icon className="w-5 h-5 text-claimondo-shield" />Meine Performance</h1>
        <p className="text-claimondo-ondo text-sm mt-0.5">{name} · {monatLabel}</p>
      </div>

      {/* ─── TAGES-TIMELINE (KFZ-41) ──────────────────────── */}
      {timeline && timeline.length > 0 && (
        <div className="bg-white rounded-2xl border border-claimondo-border p-5 mb-6">
          {/* Tages-Zusammenfassung */}
          {tagesSummary && (
            <div className="flex items-center gap-4 mb-4 pb-3 border-b border-claimondo-border">
              <h2 className="text-claimondo-navy font-semibold flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-claimondo-shield" />Heute</h2>
              <div className="flex gap-3 text-xs">
                <span className="text-claimondo-shield font-medium">{tagesSummary.termine} Termine</span>
                <span className="text-amber-400 font-medium">{tagesSummary.offeneTasks} Tasks</span>
                {tagesSummary.ueberfaellig > 0 && <span className="text-red-400 font-semibold">{tagesSummary.ueberfaellig} überfällig</span>}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-2">
            {timeline.map((item, i) => {
              const d = new Date(item.zeit)
              const zeit = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
              const style = TL_COLORS[item.typ] ?? TL_COLORS.task
              const content = (
                <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-[#f8f9fb]/50 transition-colors">
                  <span className="text-claimondo-ondo text-sm font-semibold tabular-nums w-12 shrink-0">{zeit}</span>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${style.bg} ${style.text} shrink-0`}>
                    {style.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-claimondo-navy text-sm font-medium truncate">{item.label}</p>
                    {item.detail && <p className="text-claimondo-ondo text-xs truncate">{item.detail}</p>}
                  </div>
                  {item.meetLink && (
                    <a href={item.meetLink} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] bg-purple-600 hover:bg-purple-500 text-white px-2.5 py-1 rounded-lg font-medium shrink-0"
                      onClick={e => e.stopPropagation()}>
                      Meet
                    </a>
                  )}
                </div>
              )
              return item.link ? <Link key={i} href={item.link}>{content}</Link> : content
            })}
          </div>
        </div>
      )}

      {timeline && timeline.length === 0 && tagesSummary && (
        <div className="bg-white rounded-2xl border border-claimondo-border p-5 mb-6 text-center">
          <CalendarIcon className="w-8 h-8 text-claimondo-ondo/50 mx-auto mb-2" />
          <p className="text-claimondo-ondo text-sm">Keine Termine oder Tasks für heute</p>
        </div>
      )}

      {/* KPI Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.isDispatch ? (<>
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-amber-400" />} label="Leads qualifiziert" value={stats.leadsTotal} />
          <KPI icon={<BriefcaseIcon className="w-4 h-4 text-green-400" />} label="Konvertiert" value={stats.leadsKonv} />
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-claimondo-shield" />} label="Conv. Rate" value={stats.leadsTotal > 0 ? `${Math.round((stats.leadsKonv / stats.leadsTotal) * 100)}%` : '—'} />
        </>) : (<>
          <KPI icon={<BriefcaseIcon className="w-4 h-4 text-claimondo-shield" />} label="Aktive Fälle" value={stats.aktiveFaelle} />
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-green-400" />} label="Abgeschlossen" value={stats.abgeschlossen} />
          <KPI icon={<ClockIcon className="w-4 h-4 text-amber-400" />} label="Kapazität" value={`${stats.aktiveFaelle}/${profile.kapazitaet_max ?? 100}`} />
        </>)}
        <KPI icon={<TrophyIcon className="w-4 h-4 text-amber-400" />} label="Rang" value={myRank > 0 ? `#${myRank}` : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leaderboard meiner Kategorie */}
        <div className="bg-white rounded-2xl border border-claimondo-border overflow-hidden">
          <div className="px-5 py-4 border-b border-claimondo-border">
            <h2 className="text-claimondo-navy font-semibold flex items-center gap-2"><TrophyIcon className="w-4 h-4 text-amber-400" />{stats.isDispatch ? 'Dispatch' : 'Kundenbetreuer'}-Ranking</h2>
          </div>
          <div className="divide-y divide-claimondo-border/50">
            {leaderboard.map((entry, i) => (
              <div key={entry.id} className={`px-5 py-3 flex items-center justify-between ${entry.id === userId ? 'bg-claimondo-ondo/10 border-l-2 border-claimondo-ondo' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold w-6 ${i < 3 ? MEDAL[i] : 'text-claimondo-ondo'}`}>{i + 1}</span>
                  <span className={`text-sm ${entry.id === userId ? 'text-claimondo-navy font-semibold' : 'text-claimondo-navy'}`}>{entry.name}{entry.id === userId ? ' (Du)' : ''}</span>
                </div>
                <span className="text-sm text-claimondo-ondo tabular-nums font-semibold">{entry.value}</span>
              </div>
            ))}
            {leaderboard.length === 0 && <div className="px-5 py-8 text-center text-claimondo-ondo">Keine Daten</div>}
          </div>
        </div>

        {/* Erreichbare Incentives */}
        <div className="bg-white rounded-2xl border border-claimondo-border overflow-hidden">
          <div className="px-5 py-4 border-b border-claimondo-border">
            <h2 className="text-claimondo-navy font-semibold flex items-center gap-2"><GiftIcon className="w-4 h-4 text-violet-400" />Erreichbare Incentives</h2>
          </div>
          <div className="divide-y divide-claimondo-border/50">
            {incentives.map(inc => (
              <div key={inc.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-claimondo-navy text-sm font-medium">{inc.titel}</span>
                  <span className="text-green-400 text-sm font-semibold">{fmt(inc.wert)}</span>
                </div>
                <p className="text-claimondo-ondo text-xs mt-0.5">{inc.bedingung}</p>
                {inc.beschreibung && <p className="text-claimondo-ondo/70 text-xs mt-0.5">{inc.beschreibung}</p>}
              </div>
            ))}
            {incentives.length === 0 && <div className="px-5 py-8 text-center text-claimondo-ondo">Keine Incentives verfügbar</div>}
          </div>
        </div>
      </div>

      {/* Performance-Verlauf */}
      {performanceHistory.length > 0 && (
        <div className="bg-white rounded-2xl border border-claimondo-border p-5 mt-6">
          <h3 className="text-claimondo-ondo text-xs font-semibold uppercase tracking-wider mb-3">Monatsvergleich</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-claimondo-border">
                <th className="text-left px-3 py-2 text-claimondo-ondo font-medium">Monat</th>
                <th className="text-right px-3 py-2 text-claimondo-ondo font-medium">{stats.isDispatch ? 'Leads' : 'Aktiv'}</th>
                <th className="text-right px-3 py-2 text-claimondo-ondo font-medium">{stats.isDispatch ? 'Konvertiert' : 'Abgeschl.'}</th>
                <th className="text-right px-3 py-2 text-claimondo-ondo font-medium">Umsatz</th>
              </tr></thead>
              <tbody>
                {performanceHistory.map(p => (
                  <tr key={`${p.monat}-${p.jahr}`} className="border-b border-claimondo-border/50">
                    <td className="px-3 py-2 text-claimondo-navy">{p.monat} {p.jahr}</td>
                    <td className="px-3 py-2 text-right text-claimondo-navy tabular-nums">{stats.isDispatch ? p.leads_qualifiziert : p.aktive_faelle}</td>
                    <td className="px-3 py-2 text-right text-green-400 tabular-nums">{stats.isDispatch ? p.leads_konvertiert : p.faelle_abgeschlossen}</td>
                    <td className="px-3 py-2 text-right text-claimondo-navy tabular-nums">{fmt(p.umsatz_generiert ?? 0)}</td>
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
    <div className="bg-white border border-claimondo-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-claimondo-ondo text-xs">{label}</span></div>
      <div className="text-xl font-bold text-claimondo-navy">{value}</div>
    </div>
  )
}
