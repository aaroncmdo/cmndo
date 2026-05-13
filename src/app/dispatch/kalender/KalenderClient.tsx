'use client'

// AAR-CMM: Dispatch-Kalender — Wochengrid mit Multi-SV-Filter
// Layout: Mo-Fr Spalten, 08-18 Uhr Zeilen (Zeitachse links). Jeder Termin
// als farbiger Block, Farbe = SV-Identität. Mehrfach-Belegung im selben
// Slot wird side-by-side aufgeteilt.

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronLeftIcon, ChevronRightIcon, FilterIcon, PlusIcon } from 'lucide-react'
import SpontanTerminModal from './SpontanTerminModal'

export type KalenderSv = {
  id: string
  name: string
  standort: string | null
}

export type KalenderTermin = {
  id: string
  svId: string | null
  leadId: string | null
  fallId: string | null
  startZeit: string
  endZeit: string
  status: string | null
  typ: string
  kundeName: string | null
  kennzeichen: string | null
  fallNummer: string | null
}

// Deterministische Farbpalette (Claimondo-CI + Akzentfarben)
const SV_COLORS = [
  { bg: '#4573A2', border: '#0D1B3E', text: '#FFFFFF' }, // Claimondo-Ondo
  { bg: '#7BA3CC', border: '#4573A2', text: '#0D1B3E' }, // Shield
  { bg: '#10B981', border: '#065F46', text: '#FFFFFF' }, // Emerald
  { bg: '#F59E0B', border: '#92400E', text: '#FFFFFF' }, // Amber
  { bg: '#8B5CF6', border: '#5B21B6', text: '#FFFFFF' }, // Violet
  { bg: '#EC4899', border: '#9D174D', text: '#FFFFFF' }, // Pink
  { bg: '#06B6D4', border: '#0E7490', text: '#FFFFFF' }, // Cyan
  { bg: '#F97316', border: '#9A3412', text: '#FFFFFF' }, // Orange
  { bg: '#84CC16', border: '#3F6212', text: '#FFFFFF' }, // Lime
  { bg: '#EF4444', border: '#991B1B', text: '#FFFFFF' }, // Red
] as const

const STATUS_LABEL: Record<string, string> = {
  reserviert: 'Reserviert',
  bestaetigt: 'Bestätigt',
  durchgefuehrt: 'Durchgeführt',
  gegenvorschlag: 'Gegenvorschlag',
  no_show: 'No-Show',
}

const HOUR_START = 8
const HOUR_END = 18
const SLOT_PX = 14 // px pro 5-Min-Slot → 168px/h

function formatHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function fmtDateLabel(d: Date): string {
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export default function KalenderClient({
  svList,
  termine,
  weekStartIso,
}: {
  svList: KalenderSv[]
  termine: KalenderTermin[]
  weekStartIso: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const weekStart = new Date(weekStartIso)
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))

  // SV-Filter aus URL — leer = alle anzeigen
  const visibleSvIds = useMemo(() => {
    const raw = searchParams.get('svs')
    if (!raw) return new Set(svList.map((s) => s.id))
    return new Set(raw.split(',').filter(Boolean))
  }, [searchParams, svList])

  const [filterOpen, setFilterOpen] = useState(false)
  const [spontanModal, setSpontanModal] = useState<{
    open: boolean
    date: string
    time: string
    svId?: string | null
  }>({ open: false, date: '', time: '' })

  function openSpontan(prefill?: { date?: string; time?: string; svId?: string | null }) {
    const now = new Date()
    const fallbackDate = isoDate(now)
    const fallbackTime = `${String(Math.max(now.getHours(), HOUR_START)).padStart(2, '0')}:00`
    setSpontanModal({
      open: true,
      date: prefill?.date ?? fallbackDate,
      time: prefill?.time ?? fallbackTime,
      svId: prefill?.svId ?? null,
    })
  }

  function setVisibleSvs(ids: Set<string>) {
    const params = new URLSearchParams(searchParams.toString())
    if (ids.size === svList.length || ids.size === 0) {
      params.delete('svs')
    } else {
      params.set('svs', Array.from(ids).join(','))
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  function toggleSv(id: string) {
    const next = new Set(visibleSvIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setVisibleSvs(next)
  }

  function goWeek(offsetDays: number) {
    const next = addDays(weekStart, offsetDays)
    const params = new URLSearchParams(searchParams.toString())
    params.set('woche', isoDate(next))
    router.replace(`${pathname}?${params.toString()}`)
  }

  // Farbzuordnung pro SV
  const svColorMap = useMemo(() => {
    const map = new Map<string, (typeof SV_COLORS)[number]>()
    svList.forEach((sv, i) => map.set(sv.id, SV_COLORS[i % SV_COLORS.length]))
    return map
  }, [svList])

  // Termine pro Tag gruppieren + nach SV filtern
  const terminesByDay = useMemo(() => {
    const grouped = new Map<string, KalenderTermin[]>()
    for (const t of termine) {
      if (t.svId && !visibleSvIds.has(t.svId)) continue
      const d = new Date(t.startZeit)
      const key = isoDate(d)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(t)
    }
    return grouped
  }, [termine, visibleSvIds])

  function navigateToTermin(t: KalenderTermin) {
    if (t.fallId) router.push(`/faelle/${t.fallId}`)
    else if (t.leadId) router.push(`/dispatch/leads/${t.leadId}`)
  }

  const totalSlots = (HOUR_END - HOUR_START) * 12 // 5-Min-Slots
  const gridHeight = totalSlots * SLOT_PX

  function terminToBlock(t: KalenderTermin, dayStart: Date): {
    topPx: number
    heightPx: number
    label: string
    timeLabel: string
  } {
    const start = new Date(t.startZeit)
    const end = new Date(t.endZeit)
    const minsFromDayStart = (start.getTime() - dayStart.getTime()) / 60000
    const durationMins = Math.max(15, (end.getTime() - start.getTime()) / 60000)
    const topPx = (minsFromDayStart / 5) * SLOT_PX
    const heightPx = (durationMins / 5) * SLOT_PX
    return {
      topPx,
      heightPx,
      label:
        [t.kundeName, t.kennzeichen ?? t.fallNummer].filter(Boolean).join(' · ') ||
        'Termin',
      timeLabel: `${formatHHMM(start)}–${formatHHMM(end)}`,
    }
  }

  return (
    <div className="py-4 px-4 md:px-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-claimondo-navy">Kalender</h1>
          {/* suppressHydrationWarning: fmtDateLabel nutzt toLocaleDateString — UTC vs. Berlin → #418 */}
          <p className="text-xs text-claimondo-ondo" suppressHydrationWarning>
            KW {getWeekNumber(weekStart)} · {fmtDateLabel(weekStart)} – {fmtDateLabel(addDays(weekStart, 4))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goWeek(-7)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-claimondo-navy/[0.06] hover:bg-claimondo-navy/[0.10] transition-colors"
            aria-label="Vorherige Woche"
          >
            <ChevronLeftIcon className="w-4 h-4 text-claimondo-navy" />
          </button>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString())
              params.delete('woche')
              router.replace(`${pathname}?${params.toString()}`)
            }}
            className="px-3 py-1.5 rounded-lg border border-claimondo-border text-xs font-medium text-claimondo-navy hover:bg-claimondo-ondo/5"
          >
            Heute
          </button>
          <button
            type="button"
            onClick={() => goWeek(7)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-claimondo-navy/[0.06] hover:bg-claimondo-navy/[0.10] transition-colors"
            aria-label="Nächste Woche"
          >
            <ChevronRightIcon className="w-4 h-4 text-claimondo-navy" />
          </button>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-claimondo-border text-xs font-medium text-claimondo-navy hover:bg-claimondo-ondo/5"
          >
            <FilterIcon className="w-3.5 h-3.5" />
            SV-Filter ({visibleSvIds.size}/{svList.length})
          </button>
          <button
            type="button"
            onClick={() => openSpontan()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-claimondo-ondo text-white text-xs font-semibold tracking-[-.005em] shadow-cta-ondo hover:bg-[#3a6291] hover:-translate-y-[0.5px] transition-all duration-200"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Spontan-Termin
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="rounded-xl border border-claimondo-border bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-claimondo-navy">Sichtbare Sachverständige</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVisibleSvs(new Set(svList.map((s) => s.id)))}
                className="text-[11px] text-claimondo-ondo hover:underline"
              >
                Alle
              </button>
              <button
                type="button"
                onClick={() => setVisibleSvs(new Set())}
                className="text-[11px] text-claimondo-ondo hover:underline"
              >
                Keine
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {svList.map((sv) => {
              const col = svColorMap.get(sv.id)!
              const active = visibleSvIds.has(sv.id)
              return (
                <button
                  key={sv.id}
                  type="button"
                  onClick={() => toggleSv(sv.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-opacity ${
                    active ? 'opacity-100' : 'opacity-40'
                  }`}
                  style={{
                    backgroundColor: active ? col.bg : '#F8F9FB',
                    borderColor: col.border,
                    color: active ? col.text : '#0D1B3E',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: col.bg, boxShadow: `0 0 0 1px ${col.border}` }}
                  />
                  {sv.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-claimondo-border bg-white overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: '60px repeat(5, 1fr)' }}>
          {/* Header */}
          <div className="border-b border-claimondo-border bg-claimondo-bg/50" />
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className="border-b border-l border-claimondo-border bg-claimondo-bg/50 px-2 py-2 text-center"
            >
              {/* suppressHydrationWarning: toLocaleDateString UTC vs. Europe/Berlin → React #418 */}
              <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo" suppressHydrationWarning>
                {d.toLocaleDateString('de-DE', { weekday: 'short' })}
              </p>
              <p className="text-sm font-semibold text-claimondo-navy">
                {String(d.getDate()).padStart(2, '0')}.{String(d.getMonth() + 1).padStart(2, '0')}
              </p>
            </div>
          ))}

          {/* Zeitachse */}
          <div className="relative" style={{ height: gridHeight }}>
            {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i).map((h) => (
              <div
                key={h}
                className="absolute right-1 text-[10px] text-claimondo-ondo"
                style={{ top: (h - HOUR_START) * 12 * SLOT_PX - 6 }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Tagesspalten */}
          {days.map((d) => {
            const dayStart = new Date(d)
            dayStart.setHours(HOUR_START, 0, 0, 0)
            const dayKey = isoDate(d)
            const dayTermine = terminesByDay.get(dayKey) ?? []
            // Side-by-side bei Überlappung: simple Spalten-Verteilung
            const lanes = layoutLanes(dayTermine)
            return (
              <div
                key={d.toISOString()}
                className="relative border-l border-claimondo-border cursor-pointer"
                style={{ height: gridHeight }}
                onClick={(e) => {
                  // Nur reagieren wenn Klick auf den Container (leerer Slot),
                  // nicht auf einen Termin-Block (der hat eigenes onClick).
                  if (e.target !== e.currentTarget) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const y = e.clientY - rect.top
                  const slot = Math.floor(y / SLOT_PX) // 5-Min-Slot-Index
                  // Auf 15-Min-Raster runden für saubere Termine
                  const rounded = Math.round(slot / 3) * 3
                  const totalMins = HOUR_START * 60 + rounded * 5
                  const h = Math.floor(totalMins / 60)
                  const m = totalMins % 60
                  openSpontan({
                    date: isoDate(d),
                    time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
                  })
                }}
                title="Klick: Spontan-Termin anlegen"
              >
                {/* Stundenlinien */}
                {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + 1).map((i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-claimondo-border/40"
                    style={{ top: i * 12 * SLOT_PX }}
                  />
                ))}
                {/* Termine */}
                {lanes.map(({ termin, lane, laneCount }) => {
                  if (!termin.svId) return null
                  const col = svColorMap.get(termin.svId)
                  if (!col) return null
                  const block = terminToBlock(termin, dayStart)
                  const widthPct = 100 / laneCount
                  const leftPct = lane * widthPct
                  return (
                    <button
                      key={termin.id}
                      type="button"
                      onClick={() => navigateToTermin(termin)}
                      className="absolute rounded-md text-left text-[10px] leading-tight overflow-hidden hover:ring-2 hover:ring-claimondo-navy transition-shadow shadow-sm"
                      style={{
                        top: block.topPx + 1,
                        height: Math.max(block.heightPx - 2, 18),
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        backgroundColor: col.bg,
                        borderLeft: `3px solid ${col.border}`,
                        color: col.text,
                        opacity: termin.status === 'reserviert' ? 0.75 : 1,
                      }}
                      title={`${block.timeLabel} · ${block.label} · ${
                        STATUS_LABEL[termin.status ?? ''] ?? termin.status ?? '–'
                      }`}
                    >
                      <div className="px-1.5 py-1">
                        <p className="font-semibold truncate">{block.timeLabel}</p>
                        <p className="truncate opacity-90">{block.label}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {svList.length === 0 && (
        <p className="text-xs text-claimondo-ondo">Keine aktiven Sachverständigen.</p>
      )}

      <SpontanTerminModal
        open={spontanModal.open}
        onClose={() => {
          setSpontanModal({ open: false, date: '', time: '' })
          router.refresh()
        }}
        svList={svList}
        initialDate={spontanModal.date}
        initialTime={spontanModal.time}
        initialSvId={spontanModal.svId ?? null}
      />
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getWeekNumber(d: Date): number {
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const diff = target.getTime() - firstThursday.getTime()
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000))
}

// Lane-Layout: weist überlappenden Terminen Spalten zu, damit sie
// side-by-side angezeigt werden (klassisches Calendar-Pattern).
function layoutLanes(
  termine: KalenderTermin[],
): Array<{ termin: KalenderTermin; lane: number; laneCount: number }> {
  const sorted = [...termine].sort(
    (a, b) => new Date(a.startZeit).getTime() - new Date(b.startZeit).getTime(),
  )
  const result: Array<{ termin: KalenderTermin; lane: number; laneCount: number }> = []
  // Greedy: für jeden Termin freie Lane suchen; Cluster-Größe nachgelagert setzen.
  type LaneState = { endTime: number }
  const lanes: LaneState[] = []
  const assignments = sorted.map((t) => {
    const start = new Date(t.startZeit).getTime()
    const end = new Date(t.endZeit).getTime()
    let assigned = -1
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i].endTime <= start) {
        assigned = i
        lanes[i].endTime = end
        break
      }
    }
    if (assigned === -1) {
      assigned = lanes.length
      lanes.push({ endTime: end })
    }
    return { termin: t, lane: assigned, start, end }
  })
  // Cluster-Lane-Count: für jeden Termin = max(Lane+1) der Termine die mit ihm überlappen
  for (const a of assignments) {
    let maxLane = a.lane
    for (const b of assignments) {
      if (a === b) continue
      if (b.start < a.end && b.end > a.start) {
        if (b.lane > maxLane) maxLane = b.lane
      }
    }
    result.push({ termin: a.termin, lane: a.lane, laneCount: maxLane + 1 })
  }
  return result
}
