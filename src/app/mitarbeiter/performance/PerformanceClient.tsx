'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  BarChart3Icon, BriefcaseIcon, TrophyIcon, GiftIcon, ClockIcon,
  PhoneIcon, VideoIcon, AlertTriangleIcon, CalendarIcon,
} from 'lucide-react'
import { StatBar, type StatBarItem } from '@/components/shared/StatBar'
import { Panel } from '@/components/shared/Panel'
import PageHeader from '@/components/shared/PageHeader'

type Perf = { monat: string; jahr: number; leads_qualifiziert: number; leads_konvertiert: number; faelle_abgeschlossen: number; aktive_faelle: number; umsatz_generiert: number }
type Incentive = { id: string; titel: string; beschreibung: string | null; kategorie: string; typ: string; bedingung: string; wert: number }
type TimelineItem = { zeit: string; typ: string; label: string; detail: string; color: string; link?: string; meetLink?: string }

// Rang-Identitaet (Gold/Silber/Bronze) ueber Claimondo-Toene statt roher Scales.
const MEDAL = ['text-warning-strong', 'text-claimondo-ondo', 'text-claimondo-light-blue']

const TL_STYLE: Record<string, { bg: string; text: string; icon: ReactNode }> = {
  telefon: { bg: 'bg-claimondo-ondo/15', text: 'text-claimondo-ondo', icon: <PhoneIcon className="h-4 w-4" /> },
  video: { bg: 'bg-claimondo-navy/10', text: 'text-claimondo-navy', icon: <VideoIcon className="h-4 w-4" /> },
  task: { bg: 'bg-warning-soft', text: 'text-warning-strong', icon: <AlertTriangleIcon className="h-4 w-4" /> },
  gutachter: { bg: 'bg-claimondo-light-blue/25', text: 'text-claimondo-navy', icon: <CalendarIcon className="h-4 w-4" /> },
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
  const rankMedal = myRank > 0 && myRank <= 3 ? MEDAL[myRank - 1] : 'text-claimondo-ondo'

  // 3 operative Metriken (saubere 3-Spalten-Leiste); Rang wird separat eskaliert.
  const statItems: StatBarItem[] = stats.isDispatch
    ? [
        { label: 'Leads', value: stats.leadsTotal, icon: BarChart3Icon },
        { label: 'Konvertiert', value: stats.leadsKonv, icon: BriefcaseIcon, tone: 'success' },
        { label: 'Conv. Rate', value: stats.leadsTotal > 0 ? `${Math.round((stats.leadsKonv / stats.leadsTotal) * 100)}%` : '—' },
      ]
    : [
        { label: 'Aktive Fälle', value: stats.aktiveFaelle, icon: BriefcaseIcon },
        { label: 'Abgeschlossen', value: stats.abgeschlossen, icon: BarChart3Icon, tone: 'success' },
        { label: 'Kapazität', value: `${stats.aktiveFaelle}/${profile.kapazitaet_max ?? 100}`, icon: ClockIcon },
      ]

  return (
    <div className="space-y-5">
      <PageHeader title="Meine Performance" description={`${name} · ${monatLabel}`} size="lg" />

      {/* Standing — Rang eskaliert (statt als 4. gleichrangige Karte vergraben) */}
      <div className="flex items-center gap-2.5 rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5">
        <TrophyIcon className={`h-4 w-4 shrink-0 ${rankMedal}`} />
        <p className="text-body-sm text-claimondo-navy">
          {myRank > 0 ? (
            <>Rang <span className="font-bold">#{myRank}</span> von {leaderboard.length} {stats.isDispatch ? 'Dispatchern' : 'Kundenbetreuern'} · {monatLabel}</>
          ) : (
            <>Noch nicht im Ranking · {monatLabel}</>
          )}
        </p>
      </div>

      <StatBar items={statItems} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Hauptspalte: Heute + Verlauf */}
        <div className="space-y-5">
          {timeline && timeline.length > 0 ? (
            <Panel title="Heute" count={timeline.length} icon={<CalendarIcon className="h-4 w-4 text-claimondo-ondo" />}>
              {tagesSummary && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-body-xs">
                  <span className="font-medium text-claimondo-ondo">{tagesSummary.termine} Termine</span>
                  <span className="font-medium text-warning-strong">{tagesSummary.offeneTasks} Tasks</span>
                  {tagesSummary.ueberfaellig > 0 && <span className="font-semibold text-danger-strong">{tagesSummary.ueberfaellig} überfällig</span>}
                </div>
              )}
              {timeline.map((item, i) => {
                const zeit = new Date(item.zeit).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
                const style = TL_STYLE[item.typ] ?? TL_STYLE.task
                const inner = (
                  <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-claimondo-bg">
                    <span className="w-11 shrink-0 text-body-sm font-semibold tabular-nums text-claimondo-navy">{zeit}</span>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.text}`}>{style.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium text-claimondo-navy">{item.label}</p>
                      {item.detail && <p className="truncate text-body-xs text-claimondo-ondo">{item.detail}</p>}
                    </div>
                    {item.meetLink && (
                      <a
                        href={item.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-ios-sm bg-claimondo-navy px-2.5 py-1 text-caption font-medium text-white"
                        onClick={e => e.stopPropagation()}
                      >
                        Meet
                      </a>
                    )}
                  </div>
                )
                return item.link ? (
                  <Link key={i} href={item.link} className="block">{inner}</Link>
                ) : (
                  <div key={i}>{inner}</div>
                )
              })}
            </Panel>
          ) : (
            tagesSummary && (
              <div className="rounded-ios-md border border-claimondo-border bg-white px-6 py-12 text-center">
                <CalendarIcon className="mx-auto mb-2 h-8 w-8 text-claimondo-ondo/50" />
                <p className="text-body-sm text-claimondo-ondo">Keine Termine oder Tasks für heute</p>
              </div>
            )
          )}

          {performanceHistory.length > 0 && (
            <Panel title="Monatsvergleich">
              <div className="flex items-center gap-3 px-4 py-2 text-caption uppercase text-claimondo-ondo/70">
                <span className="flex-1">Monat</span>
                <span className="w-14 text-right">{stats.isDispatch ? 'Leads' : 'Aktiv'}</span>
                <span className="w-16 text-right">{stats.isDispatch ? 'Konv.' : 'Abg.'}</span>
                <span className="w-20 text-right">Umsatz</span>
              </div>
              {performanceHistory.map(p => (
                <div key={`${p.monat}-${p.jahr}`} className="flex items-center gap-3 px-4 py-2.5 text-body-sm">
                  <span className="flex-1 truncate text-claimondo-navy">{p.monat} {p.jahr}</span>
                  <span className="w-14 text-right tabular-nums text-claimondo-navy">{stats.isDispatch ? p.leads_qualifiziert : p.aktive_faelle}</span>
                  <span className="w-16 text-right font-medium tabular-nums text-success-strong">{stats.isDispatch ? p.leads_konvertiert : p.faelle_abgeschlossen}</span>
                  <span className="w-20 text-right tabular-nums text-claimondo-ondo">{fmt(p.umsatz_generiert ?? 0)}</span>
                </div>
              ))}
            </Panel>
          )}
        </div>

        {/* Seitenspalte: Ranking + Incentives */}
        <div className="space-y-5">
          <Panel title={`${stats.isDispatch ? 'Dispatch' : 'Kundenbetreuer'}-Ranking`} icon={<TrophyIcon className="h-4 w-4 text-warning-strong" />}>
            {leaderboard.length === 0 && <div className="px-4 py-8 text-center text-body-sm text-claimondo-ondo">Keine Daten</div>}
            {leaderboard.map((entry, i) => (
              <div key={entry.id} className={`flex items-center justify-between px-4 py-2.5 ${entry.id === userId ? 'bg-claimondo-ondo/10' : ''}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`w-5 shrink-0 text-body-sm font-bold tabular-nums ${i < 3 ? MEDAL[i] : 'text-claimondo-ondo'}`}>{i + 1}</span>
                  <span className={`truncate text-body-sm text-claimondo-navy ${entry.id === userId ? 'font-semibold' : ''}`}>{entry.name}{entry.id === userId ? ' (Sie)' : ''}</span>
                </div>
                <span className="shrink-0 text-body-sm font-semibold tabular-nums text-claimondo-ondo">{entry.value}</span>
              </div>
            ))}
          </Panel>

          <Panel title="Erreichbare Incentives" icon={<GiftIcon className="h-4 w-4 text-claimondo-ondo" />}>
            {incentives.length === 0 && <div className="px-4 py-8 text-center text-body-sm text-claimondo-ondo">Keine Incentives verfügbar</div>}
            {incentives.map(inc => (
              <div key={inc.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-sm font-medium text-claimondo-navy">{inc.titel}</span>
                  <span className="shrink-0 text-body-sm font-semibold text-success-strong">{fmt(inc.wert)}</span>
                </div>
                <p className="mt-0.5 text-body-xs text-claimondo-ondo">{inc.bedingung}</p>
                {inc.beschreibung && <p className="mt-0.5 text-body-xs text-claimondo-ondo/70">{inc.beschreibung}</p>}
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  )
}
