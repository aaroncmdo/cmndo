'use client'

// Geteilte Termine-Hub-View (Kunde + Flotte): eine chronologische Timeline mit Typ-Badges
// (Besichtigung/Nachbesichtigung/Reparatur/Beratung/Konfrontation) + Kalender-Toggle.
// Extrahiert aus dem frueheren KundeTermineClient; portal-spezifisch nur via linkFor/showActions.

import { useState, useMemo } from 'react'
import { useTranslations, useFormatter } from 'next-intl'
import { CalendarIcon, ListIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { TermineRow, type FallInfo } from './TermineRow'
import type { KundeTerminEntry } from '@/lib/claims/kunde-termin-entries'

export type { FallInfo } from './TermineRow'

// Dot-Farbe pro Status im Kalender.
const DOT_CLS: Record<string, string> = {
  bestaetigt: 'bg-success', reserviert: 'bg-warning', gegenvorschlag: 'bg-warning',
  abgelehnt: 'bg-danger', abgeschlossen: 'bg-claimondo-border',
}
const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
// superseded/abgesagte Termine NIE listen (robust gegen cancelled_at-Drift).
const VERSTECKT = new Set(['verschoben', 'verlegt', 'storniert', 'abgesagt'])

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type TermineHubProps = {
  termine: KundeTerminEntry[]
  fallMap: Record<string, FallInfo>
  linkFor: (t: KundeTerminEntry) => string | null
  showActions: boolean
}

export function TermineHub({ termine, fallMap, linkFor, showActions }: TermineHubProps) {
  const t = useTranslations('kunde.termine')
  const format = useFormatter()
  const [view, setView] = useState<'liste' | 'kalender'>('liste')
  const [month, setMonth] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const now = new Date()
  const todayKey = toDateKey(now)

  const sichtbar = useMemo(() => termine.filter((tr) => !(tr.status && VERSTECKT.has(tr.status))), [termine])
  const mitDatum = useMemo(() => sichtbar.filter((tr) => tr.start != null), [sichtbar])
  const offen = sichtbar.filter((tr) => tr.start == null)
  const kommend = mitDatum.filter((tr) => new Date(tr.start as string) >= now && tr.status !== 'abgelehnt')
  const vergangen = mitDatum.filter((tr) => new Date(tr.start as string) < now || tr.status === 'abgelehnt' || tr.status === 'abgeschlossen')

  function fallFor(tr: KundeTerminEntry): FallInfo | undefined {
    return (tr.fall_id ? fallMap[tr.fall_id] : undefined) ?? (tr.claim_id ? fallMap[tr.claim_id] : undefined)
  }

  // Termine nach Tag gruppieren (nur datierte).
  const byDay = useMemo(() => {
    const map = new Map<string, KundeTerminEntry[]>()
    for (const tr of mitDatum) {
      const key = toDateKey(new Date(tr.start as string))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(tr)
    }
    return map
  }, [mitDatum])

  // Kalender-Tage fuer den aktuellen Monat (Montag als Wochenanfang).
  const calDays = useMemo(() => {
    const year = month.getFullYear()
    const mon = month.getMonth()
    const firstDay = new Date(year, mon, 1)
    const lastDay = new Date(year, mon + 1, 0)
    const startOffset = (firstDay.getDay() + 6) % 7
    const cells: Array<{ date: Date; key: string } | null> = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, mon, d)
      cells.push({ date, key: toDateKey(date) })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [month])

  function prevMonth() { setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSelectedKey(null) }
  function nextMonth() { setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSelectedKey(null) }

  const selectedTermine = selectedKey ? (byDay.get(selectedKey) ?? []) : []

  function renderRow(tr: KundeTerminEntry, muted?: boolean) {
    return <TermineRow key={tr.id} termin={tr} fall={fallFor(tr)} href={linkFor(tr)} showActions={showActions && !muted} muted={muted} />
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <PageHeader
        title={t('liste.title')} description={t('liste.description')} size="lg"
        actions={
          <div className="flex items-center rounded-ios-xl border border-claimondo-border bg-white p-0.5 gap-0.5 shrink-0">
            <button type="button" onClick={() => setView('liste')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg text-xs font-medium transition-colors ${view === 'liste' ? 'bg-claimondo-navy text-white' : 'text-claimondo-ondo hover:text-claimondo-navy'}`}>
              <ListIcon className="w-3.5 h-3.5" />{t('toggle.liste')}
            </button>
            <button type="button" onClick={() => setView('kalender')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg text-xs font-medium transition-colors ${view === 'kalender' ? 'bg-claimondo-navy text-white' : 'text-claimondo-ondo hover:text-claimondo-navy'}`}>
              <CalendarIcon className="w-3.5 h-3.5" />{t('toggle.kalender')}
            </button>
          </div>
        }
      />

      {sichtbar.length === 0 && (
        <div className="bg-white rounded-2xl border border-claimondo-border p-10 text-center">
          <CalendarIcon className="w-6 h-6 text-claimondo-ondo/50 mx-auto mb-2" />
          <p className="text-sm text-claimondo-ondo/70">{t('liste.empty')}</p>
        </div>
      )}

      {/* ── Kalender-View ─────────────────────────────────────────────── */}
      {view === 'kalender' && mitDatum.length > 0 && (
        <div className="bg-white rounded-2xl border border-claimondo-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-claimondo-border">
            <button type="button" onClick={prevMonth} className="p-1.5 rounded-ios-lg hover:bg-claimondo-bg text-claimondo-ondo transition-colors" aria-label={t('kalender.prevMonth')}>
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-claimondo-navy capitalize">
              {format.dateTime(month, { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })}
            </span>
            <button type="button" onClick={nextMonth} className="p-1.5 rounded-ios-lg hover:bg-claimondo-bg text-claimondo-ondo transition-colors" aria-label={t('kalender.nextMonth')}>
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 px-2 pt-2">
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-claimondo-ondo/70 py-1.5">{t(`kalender.dayLabels.${d}`)}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5 px-2 pb-3">
            {calDays.map((cell, i) => {
              if (!cell) return <div key={i} className="h-11" />
              const dayTermine = byDay.get(cell.key) ?? []
              const isToday = cell.key === todayKey
              const isSelected = cell.key === selectedKey
              return (
                <button key={cell.key} type="button"
                  onClick={() => setSelectedKey(isSelected ? null : cell.key)}
                  className={`relative flex flex-col items-center justify-start pt-1.5 pb-1 h-11 rounded-ios-xl transition-colors ${isSelected ? 'bg-claimondo-navy text-white' : isToday ? 'bg-[var(--brand-secondary-soft)] text-claimondo-navy font-bold' : 'hover:bg-claimondo-bg text-claimondo-navy'} ${dayTermine.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                  disabled={dayTermine.length === 0}
                  aria-label={`${format.dateTime(cell.date, { timeZone: 'Europe/Berlin' })}: ${t('kalender.dayAriaCount', { count: dayTermine.length })}`}>
                  <span className="text-xs leading-none">{cell.date.getDate()}</span>
                  {dayTermine.length > 0 && (
                    <div className="flex gap-0.5 mt-1">
                      {dayTermine.slice(0, 3).map((tr, ti) => (
                        <span key={ti} className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/80' : (DOT_CLS[tr.status ?? ''] ?? 'bg-claimondo-ondo')}`} />
                      ))}
                      {dayTermine.length > 3 && (
                        <span className={`text-[8px] font-bold ${isSelected ? 'text-white/70' : 'text-claimondo-ondo/70'}`}>+</span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {selectedKey && selectedTermine.length > 0 && (
            <div className="border-t border-claimondo-border px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider">
                {format.dateTime(new Date(selectedKey + 'T12:00:00'), { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'Europe/Berlin' })}
              </p>
              {selectedTermine.map((tr) => renderRow(tr))}
            </div>
          )}

          <div className="border-t border-claimondo-border px-5 py-2.5 flex gap-4">
            {['bestaetigt', 'reserviert', 'abgelehnt'].map((status) => (
              <div key={status} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${DOT_CLS[status]}`} />
                <span className="text-[10px] text-claimondo-ondo">{t(`kalender.legend.${status}`)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Listen-View ───────────────────────────────────────────────── */}
      {view === 'liste' && (
        <>
          {offen.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-2">{t('liste.offen')}</h2>
              <div className="space-y-2">{offen.map((tr) => renderRow(tr))}</div>
            </section>
          )}
          {kommend.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-2">{t('liste.kommend')}</h2>
              <div className="space-y-2">{kommend.map((tr) => renderRow(tr))}</div>
            </section>
          )}
          {vergangen.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-2">{t('liste.verlauf')}</h2>
              <div className="space-y-2 opacity-80">{vergangen.map((tr) => renderRow(tr, true))}</div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
