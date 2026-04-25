'use client'

// AAR-639: Kalender-View + Liste-Toggle für Kunden-Termine.
// Liste: Kommend/Verlauf-Sektionen (wie bisher).
// Kalender: Monatsraster Mo–So, Termin-Dots farbkodiert nach Status,
// Klick auf Tag öffnet Tages-Detail darunter.

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  CalendarIcon, ListIcon,
  ChevronLeftIcon, ChevronRightIcon,
  VideoIcon, HardHatIcon, PhoneIcon,
} from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

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
  fall_nummer: string | null
  fahrzeug: string
}

const STATUS_LABEL: Record<string, string> = {
  reserviert: 'Reserviert — wartet auf SV-Bestätigung',
  bestaetigt: 'Bestätigt',
  gegenvorschlag: 'Gegenvorschlag vom SV — Antwort nötig',
  abgelehnt: 'Abgelehnt',
  abgeschlossen: 'Durchgeführt',
}

const STATUS_BADGE: Record<string, string> = {
  reserviert: 'bg-amber-50 text-amber-700 border-amber-200',
  bestaetigt: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  gegenvorschlag: 'bg-amber-50 text-amber-700 border-amber-200',
  abgelehnt: 'bg-red-50 text-red-700 border-red-200',
  abgeschlossen: 'bg-[#f8f9fb] text-claimondo-ondo border-claimondo-border',
}

// Dot-Farbe pro Status im Kalender
const DOT_CLS: Record<string, string> = {
  bestaetigt: 'bg-emerald-500',
  reserviert: 'bg-amber-400',
  gegenvorschlag: 'bg-amber-400',
  abgelehnt: 'bg-red-400',
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
    for (const t of termine) {
      const key = toDateKey(new Date(t.start_zeit))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
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

  const kommend = termine.filter(t => new Date(t.start_zeit) >= now && t.status !== 'abgelehnt')
  const vergangen = termine.filter(t => new Date(t.start_zeit) < now || t.status === 'abgelehnt' || t.status === 'abgeschlossen')

  function prevMonth() { setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSelectedKey(null) }
  function nextMonth() { setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSelectedKey(null) }

  const selectedTermine = selectedKey ? (byDay.get(selectedKey) ?? []) : []

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      {/* Header + View-Toggle */}
      <PageHeader
        title="Meine Termine"
        description="Alle Gutachter-Termine zu deinen Fällen."
        size="lg"
        actions={
          <div className="flex items-center rounded-xl border border-claimondo-border bg-white p-0.5 gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setView('liste')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                view === 'liste' ? 'bg-[#0D1B3E] text-white' : 'text-claimondo-ondo hover:text-claimondo-navy'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              Liste
            </button>
            <button
              type="button"
              onClick={() => setView('kalender')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                view === 'kalender' ? 'bg-[#0D1B3E] text-white' : 'text-claimondo-ondo hover:text-claimondo-navy'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              Kalender
            </button>
          </div>
        }
      />

      {termine.length === 0 && (
        <div className="bg-white rounded-2xl border border-claimondo-border p-10 text-center">
          <CalendarIcon className="w-6 h-6 text-claimondo-ondo/50 mx-auto mb-2" />
          <p className="text-sm text-claimondo-ondo/70">Aktuell keine Termine geplant</p>
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
              className="p-1.5 rounded-lg hover:bg-[#f8f9fb] text-claimondo-ondo transition-colors"
              aria-label="Vorheriger Monat"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-[#0D1B3E] capitalize">
              {month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-[#f8f9fb] text-claimondo-ondo transition-colors"
              aria-label="Nächster Monat"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Wochen-Header */}
          <div className="grid grid-cols-7 px-2 pt-2">
            {DAY_LABELS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-claimondo-ondo/70 py-1.5">
                {d}
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
                  className={`relative flex flex-col items-center justify-start pt-1.5 pb-1 h-11 rounded-xl transition-colors ${
                    isSelected
                      ? 'bg-[#0D1B3E] text-white'
                      : isToday
                        ? 'bg-[#eef3f9] text-[#0D1B3E] font-bold'
                        : 'hover:bg-[#f8f9fb] text-claimondo-navy'
                  } ${dayTermine.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                  disabled={dayTermine.length === 0}
                  aria-label={`${cell.date.toLocaleDateString('de-DE')}: ${dayTermine.length} Termin(e)`}
                >
                  <span className="text-xs leading-none">{cell.date.getDate()}</span>
                  {dayTermine.length > 0 && (
                    <div className="flex gap-0.5 mt-1">
                      {dayTermine.slice(0, 3).map((t, ti) => (
                        <span
                          key={ti}
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected ? 'bg-white/80' : (DOT_CLS[t.status] ?? 'bg-[#4573A2]')
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
                {new Date(selectedKey + 'T12:00:00').toLocaleDateString('de-DE', {
                  weekday: 'long', day: '2-digit', month: 'long',
                })}
              </p>
              {selectedTermine.map(t => (
                <TerminCard key={t.id} t={t} fall={fallMap[t.fall_id]} />
              ))}
            </div>
          )}

          {/* Legende */}
          <div className="border-t border-claimondo-border px-5 py-2.5 flex gap-4">
            {[
              { status: 'bestaetigt', label: 'Bestätigt' },
              { status: 'reserviert', label: 'Reserviert' },
              { status: 'abgelehnt', label: 'Abgelehnt' },
            ].map(({ status, label }) => (
              <div key={status} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${DOT_CLS[status]}`} />
                <span className="text-[10px] text-claimondo-ondo">{label}</span>
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
              <h2 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-2">Kommend</h2>
              <div className="space-y-2">
                {kommend.map(t => <TerminCard key={t.id} t={t} fall={fallMap[t.fall_id]} />)}
              </div>
            </section>
          )}
          {vergangen.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-2">Verlauf</h2>
              <div className="space-y-2 opacity-80">
                {vergangen.map(t => <TerminCard key={t.id} t={t} fall={fallMap[t.fall_id]} muted />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function TerminCard({
  t,
  fall,
  muted,
}: {
  t: TerminRow
  fall?: FallInfo
  muted?: boolean
}) {
  const isKb = t.typ === 'kb_beratung'
  const isVideo = t.kanal === 'video'
  const Icon = isKb ? VideoIcon : HardHatIcon
  const start = new Date(t.start_zeit)
  const badgeCls = STATUS_BADGE[t.status] ?? 'bg-[#f8f9fb] text-claimondo-ondo border-claimondo-border'
  const statusLabel = STATUS_LABEL[t.status] ?? t.status

  // AAR-698: Karte komplett klickbar → Termin-Detail-View.
  // KB-Beratungstermine haben eine andere Detail-Logik und bleiben vorerst
  // bei „Zum Fall" (Beratungs-Detail kommt in eigenem Ticket).
  const targetHref = isKb ? (fall ? `/kunde/faelle/${fall.id}` : '#') : `/kunde/termine/${t.id}`

  return (
    <Link
      href={targetHref}
      className={`block bg-white rounded-2xl border border-claimondo-border p-4 hover:border-[#4573A2]/40 hover:shadow-sm transition ${muted ? 'opacity-90' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#f0f4f8] flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-[#4573A2]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-claimondo-navy">
              {isKb ? 'Kunden-Beratung' : 'Gutachter-Termin'}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${badgeCls}`}>
              {statusLabel}
            </span>
          </div>
          <p className="text-sm text-claimondo-navy mt-1">
            {start.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}
            {' · '}
            {start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </p>
          {fall && (
            <p className="text-xs text-claimondo-ondo mt-0.5">
              Fall {fall.fall_nummer ?? fall.id.slice(0, 8)} · {fall.fahrzeug}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs">
            {t.status === 'bestaetigt' && !isKb && (
              <span className="text-claimondo-ondo/70">
                {isVideo
                  ? <><VideoIcon className="w-3 h-3 inline" /> Video-Termin</>
                  : <><PhoneIcon className="w-3 h-3 inline" /> Vor-Ort-Termin</>}
              </span>
            )}
            <span className="text-[#4573A2] font-medium ml-auto">Details öffnen →</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
