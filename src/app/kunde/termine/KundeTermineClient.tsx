'use client'

// AAR-639: Kalender-View + Liste-Toggle für Kunden-Termine.
// Liste: Kommend/Verlauf-Sektionen (wie bisher).
// Kalender: Monatsraster Mo–So, Termin-Dots farbkodiert nach Status,
// Klick auf Tag öffnet Tages-Detail darunter.

import { useState, useMemo } from 'react'
import { useTranslations, useFormatter } from 'next-intl'
import Link from 'next/link'
import {
  CalendarIcon, ListIcon,
  ChevronLeftIcon, ChevronRightIcon,
  VideoIcon, HardHatIcon, PhoneIcon,
} from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { TerminStatusBadge } from '@/components/shared/TerminStatusBadge'

export type TerminRow = {
  id: string
  start_zeit: string
  status: string
  typ: string | null
  kanal: string | null
  fall_id: string
  ablehnen_token: string | null
}

export type FallInfo = {
  id: string
  claim_nummer: string | null
  fahrzeug: string
}

const STATUS_LABEL: Record<string, string> = {
  reserviert: 'Reserviert — wartet auf SV-Bestätigung',
  bestaetigt: 'Bestätigt',
  gegenvorschlag: 'Gegenvorschlag vom SV — Antwort nötig',
  abgelehnt: 'Abgelehnt',
  abgeschlossen: 'Durchgeführt',
}

// Dot-Farbe pro Status im Kalender
const DOT_CLS: Record<string, string> = {
  bestaetigt: 'bg-success',
  reserviert: 'bg-warning',
  gegenvorschlag: 'bg-warning',
  abgelehnt: 'bg-danger',
  abgeschlossen: 'bg-claimondo-border',
}

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function KundeTermineClient({
  termine,
  fallMap,
}: {
  termine: TerminRow[]
  fallMap: Record<string, FallInfo>
}) {
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

  // Termine nach Tag gruppieren
  const byDay = useMemo(() => {
    const map = new Map<string, TerminRow[]>()
    for (const tr of termine) {
      const key = toDateKey(new Date(tr.start_zeit))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(tr)
    }
    return map
  }, [termine])

  // Kalender-Tage für den aktuellen Monat (Montag als Wochenanfang)
  const calDays = useMemo(() => {
    const year = month.getFullYear()
    const mon = month.getMonth()
    const firstDay = new Date(year, mon, 1)
    const lastDay = new Date(year, mon + 1, 0)
    const startOffset = (firstDay.getDay() + 6) % 7 // 0=Mo
    const cells: Array<{ date: Date; key: string } | null> = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, mon, d)
      cells.push({ date, key: toDateKey(date) })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [month])

  // Geist-Defense (Schicht 2): superseded/abgesagte Termine NIE listen — robust gegen
  // cancelled_at-Drift (das Feld ist als "inaktiv"-Signal unzuverlaessig; s. verlege-Geist-Fix in
  // state-transitions.ts). 'abgelehnt'/'abgeschlossen' bleiben bewusst als Historie sichtbar.
  const VERSTECKTE_STATUS = new Set(['verschoben', 'verlegt', 'storniert', 'abgesagt'])
  const sichtbar = termine.filter(tr => !VERSTECKTE_STATUS.has(tr.status))
  const kommend = sichtbar.filter(tr => new Date(tr.start_zeit) >= now && tr.status !== 'abgelehnt')
  const vergangen = sichtbar.filter(tr => new Date(tr.start_zeit) < now || tr.status === 'abgelehnt' || tr.status === 'abgeschlossen')

  function prevMonth() { setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSelectedKey(null) }
  function nextMonth() { setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSelectedKey(null) }

  const selectedTermine = selectedKey ? (byDay.get(selectedKey) ?? []) : []

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      {/* Header + View-Toggle */}
      <PageHeader
        title={t('liste.title')}
        description={t('liste.description')}
        size="lg"
        actions={
          <div className="flex items-center rounded-ios-xl border border-claimondo-border bg-white p-0.5 gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setView('liste')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg text-xs font-medium transition-colors ${
                view === 'liste' ? 'bg-claimondo-navy text-white' : 'text-claimondo-ondo hover:text-claimondo-navy'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              {t('toggle.liste')}
            </button>
            <button
              type="button"
              onClick={() => setView('kalender')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg text-xs font-medium transition-colors ${
                view === 'kalender' ? 'bg-claimondo-navy text-white' : 'text-claimondo-ondo hover:text-claimondo-navy'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              {t('toggle.kalender')}
            </button>
          </div>
        }
      />

      {termine.length === 0 && (
        <div className="bg-white rounded-2xl border border-claimondo-border p-10 text-center">
          <CalendarIcon className="w-6 h-6 text-claimondo-ondo/50 mx-auto mb-2" />
          <p className="text-sm text-claimondo-ondo/70">{t('liste.empty')}</p>
        </div>
      )}

      {/* ── Kalender-View ────────────────────────────────────────────── */}
      {view === 'kalender' && termine.length > 0 && (
        <div className="bg-white rounded-2xl border border-claimondo-border overflow-hidden">
          {/* Monats-Navigation */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-claimondo-border">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-ios-lg hover:bg-claimondo-bg text-claimondo-ondo transition-colors"
              aria-label={t('kalender.prevMonth')}
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-claimondo-navy capitalize">
              {format.dateTime(month, { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-ios-lg hover:bg-claimondo-bg text-claimondo-ondo transition-colors"
              aria-label={t('kalender.nextMonth')}
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Wochen-Header */}
          <div className="grid grid-cols-7 px-2 pt-2">
            {DAY_LABELS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-claimondo-ondo/70 py-1.5">
                {t(`kalender.dayLabels.${d}`)}
              </div>
            ))}
          </div>

          {/* Tage-Raster */}
          <div className="grid grid-cols-7 gap-0.5 px-2 pb-3">
            {calDays.map((cell, i) => {
              if (!cell) return <div key={i} className="h-11" />
              const dayTermine = byDay.get(cell.key) ?? []
              const isToday = cell.key === todayKey
              const isSelected = cell.key === selectedKey
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedKey(isSelected ? null : cell.key)}
                  className={`relative flex flex-col items-center justify-start pt-1.5 pb-1 h-11 rounded-ios-xl transition-colors ${
                    isSelected
                      ? 'bg-claimondo-navy text-white'
                      : isToday
                        ? 'bg-[var(--brand-secondary-soft)] text-claimondo-navy font-bold'
                        : 'hover:bg-claimondo-bg text-claimondo-navy'
                  } ${dayTermine.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                  disabled={dayTermine.length === 0}
                  aria-label={`${format.dateTime(cell.date, { timeZone: 'Europe/Berlin' })}: ${t('kalender.dayAriaCount', { count: dayTermine.length })}`}
                >
                  <span className="text-xs leading-none">{cell.date.getDate()}</span>
                  {dayTermine.length > 0 && (
                    <div className="flex gap-0.5 mt-1">
                      {dayTermine.slice(0, 3).map((tr, ti) => (
                        <span
                          key={ti}
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected ? 'bg-white/80' : (DOT_CLS[tr.status] ?? 'bg-claimondo-ondo')
                          }`}
                        />
                      ))}
                      {dayTermine.length > 3 && (
                        <span className={`text-[8px] font-bold ${isSelected ? 'text-white/70' : 'text-claimondo-ondo/70'}`}>
                          +
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tages-Detail */}
          {selectedKey && selectedTermine.length > 0 && (
            <div className="border-t border-claimondo-border px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider">
                {format.dateTime(new Date(selectedKey + 'T12:00:00'), {
                  weekday: 'long', day: '2-digit', month: 'long', timeZone: 'Europe/Berlin',
                })}
              </p>
              {selectedTermine.map(tr => (
                <TerminCard key={tr.id} termin={tr} fall={fallMap[tr.fall_id]} />
              ))}
            </div>
          )}

          {/* Legende */}
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

      {/* ── Listen-View ──────────────────────────────────────────────── */}
      {view === 'liste' && (
        <>
          {kommend.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-2">{t('liste.kommend')}</h2>
              <div className="space-y-2">
                {kommend.map(tr => <TerminCard key={tr.id} termin={tr} fall={fallMap[tr.fall_id]} />)}
              </div>
            </section>
          )}
          {vergangen.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-2">{t('liste.verlauf')}</h2>
              <div className="space-y-2 opacity-80">
                {vergangen.map(tr => <TerminCard key={tr.id} termin={tr} fall={fallMap[tr.fall_id]} muted />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function TerminCard({
  termin,
  fall,
  muted,
}: {
  termin: TerminRow
  fall?: FallInfo
  muted?: boolean
}) {
  const t = useTranslations('kunde.termine')
  const format = useFormatter()
  const isKb = termin.typ === 'kb_beratung'
  const isVideo = termin.kanal === 'video'
  const Icon = isKb ? VideoIcon : HardHatIcon
  const start = new Date(termin.start_zeit)
  const statusLabel = termin.status in STATUS_LABEL ? t(`statusLabel.${termin.status}`) : termin.status

  // AAR-698: Karte komplett klickbar → Termin-Detail-View.
  // KB-Beratungstermine haben eine andere Detail-Logik und bleiben vorerst
  // bei „Zum Fall" (Beratungs-Detail kommt in eigenem Ticket).
  const targetHref = isKb ? (fall ? `/kunde/faelle/${fall.id}` : '#') : `/kunde/termine/${termin.id}`

  return (
    <Link
      href={targetHref}
      className={`block bg-white rounded-2xl border border-claimondo-border p-4 hover:border-claimondo-ondo/40 hover:shadow-sm transition ${muted ? 'opacity-90' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-ios-xl bg-[var(--brand-secondary-soft)] flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-claimondo-ondo" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-claimondo-navy">
              {isKb ? t('card.kundenBeratung') : t('card.gutachterTermin')}
            </span>
            <TerminStatusBadge status={termin.status} label={statusLabel} />
          </div>
          <p className="text-sm text-claimondo-navy mt-1">
            {format.dateTime(start, { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'Europe/Berlin' })}
            {' · '}
            {format.dateTime(start, { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })}
          </p>
          {fall && (
            <p className="text-xs text-claimondo-ondo mt-0.5">
              {t('card.fallPrefix')} {fall.claim_nummer ?? fall.id.slice(0, 8)} · {fall.fahrzeug}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs">
            {termin.status === 'bestaetigt' && !isKb && (
              <span className="text-claimondo-ondo/70">
                {isVideo
                  ? <><VideoIcon className="w-3 h-3 inline" /> {t('card.videoTermin')}</>
                  : <><PhoneIcon className="w-3 h-3 inline" /> {t('card.vorOrtTermin')}</>}
              </span>
            )}
            <span className="text-claimondo-ondo font-medium ml-auto">{t('card.detailsOeffnen')}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
