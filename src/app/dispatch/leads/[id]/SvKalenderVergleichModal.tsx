'use client'

// SV-Kalender-Vergleichsmodal mit Tageskalender-Ansicht.
// Layout:
//   - Oben: SV-Tabs (Cakmak | Kloss | …)
//   - Mitte: Tagesraster 7–20 Uhr mit gelben Termin-Blöcken
//   - Zwischen Terminen: blaue Route-Marker mit ETAs vom/zum Besichtigungsort
//   - Rechts: Tag-Liste (heute + 13 Tage)
//
// Damit kann der Dispatcher am Telefon mit dem Kunden visuell sehen wo der
// SV Lücken hat und ob der Besichtigungsort dazwischen passt.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/primitives/Modal'
import {
  CalendarIcon,
  MapPinIcon,
  NavigationIcon,
  XIcon,
  RefreshCwIcon,
  ClockIcon,
  CalendarPlusIcon,
} from 'lucide-react'
import {
  getSvKalenderVergleich,
  type SvKalenderResult,
  type SvKalenderTermin,
} from './_actions/sv-kalender'
import { reserveSvTerminForLead } from './actions'

type Props = {
  open: boolean
  onClose: () => void
  leadId: string
  svIds: string[]
  /** Wunschtermin als visueller Marker im Kalender. */
  wunschterminIso?: string | null
  /** Wird nach erfolgreicher Reservierung aufgerufen — typischerweise um die Lead-Page zu refreshen. */
  onReserved?: () => void
}

const TERMIN_DAUER_DEFAULT = 45

const HOUR_START = 7
const HOUR_END = 20
const PX_PER_MIN = 1.6
const TOTAL_MIN = (HOUR_END - HOUR_START) * 60
const RAIL_HEIGHT = TOTAL_MIN * PX_PER_MIN

function fmtDayShort(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function dayKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function minutesOfDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

export default function SvKalenderVergleichModal({
  open,
  onClose,
  leadId,
  svIds,
  wunschterminIso,
  onReserved,
}: Props) {
  const router = useRouter()
  const [data, setData] = useState<SvKalenderResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSvId, setActiveSvId] = useState<string | null>(null)
  const [activeDayKey, setActiveDayKey] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Reservieren-Confirm
  const [reservePending, startReserve] = useTransition()
  const [reserveDraft, setReserveDraft] = useState<{ startIso: string; dauerMin: number } | null>(null)
  const [reserveError, setReserveError] = useState<string | null>(null)
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || svIds.length === 0) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getSvKalenderVergleich(leadId, svIds, 14)
      .then((r) => {
        if (cancelled) return
        if (r.ok) {
          setData(r)
          setActiveSvId((cur) => (cur && svIds.includes(cur) ? cur : svIds[0] ?? null))
          setActiveDayKey((cur) => cur ?? dayKey(r.fromIso))
        } else {
          setError(r.error ?? 'Kalender konnte nicht geladen werden')
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fehler')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, leadId, svIds, reloadKey])

  const activeTab = useMemo(
    () => data?.tabs.find((t) => t.svId === activeSvId) ?? data?.tabs[0] ?? null,
    [data, activeSvId],
  )

  // 14 Tage ab heute, mit/ohne Termine — für die Tag-Liste rechts
  const tage = useMemo(() => {
    if (!data) return [] as Array<{ key: string; tagIso: string; anzahlTermine: Map<string, number> }>
    const start = new Date(data.fromIso)
    const out: Array<{ key: string; tagIso: string; anzahlTermine: Map<string, number> }> = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(start.getTime() + i * 24 * 3600_000)
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      // Anzahl Termine pro SV an diesem Tag
      const m = new Map<string, number>()
      for (const tab of data.tabs) {
        const cnt = tab.termine.filter((t) => dayKey(t.startIso) === k).length
        m.set(tab.svId, cnt)
      }
      out.push({ key: k, tagIso: d.toISOString(), anzahlTermine: m })
    }
    return out
  }, [data])

  // Termine des aktiven SV am aktiven Tag, sortiert
  const termineHeute = useMemo<SvKalenderTermin[]>(() => {
    if (!activeTab || !activeDayKey) return []
    return activeTab.termine
      .filter((t) => dayKey(t.startIso) === activeDayKey)
      .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())
  }, [activeTab, activeDayKey])

  // Route-Lücken zwischen aufeinanderfolgenden Terminen
  type Luecke = {
    key: string
    /** ISO-String "vorher-Ende" */
    vonIso: string
    /** ISO-String "nachher-Start" */
    bisIso: string
    luckeMin: number
    /** ETA Vortermin-Ort → Besichtigungsort */
    etaHinMin: number | null
    /** ETA Besichtigungsort → Folgetermin-Ort (Annäherung: gleicher Wert für nächsten Termin) */
    etaZurueckMin: number | null
    /** Reicht die Lücke? (etaHin + etaZurueck + 30 min Besichtigungspuffer) */
    reicht: boolean
  }
  const lueckenHeute = useMemo<Luecke[]>(() => {
    if (termineHeute.length < 2) return []
    const BESICHTIGUNG_MIN = 45 // typische Besichtigungsdauer
    const out: Luecke[] = []
    for (let i = 0; i < termineHeute.length - 1; i++) {
      const v = termineHeute[i]
      const n = termineHeute[i + 1]
      const luckeMin = (new Date(n.startIso).getTime() - new Date(v.endIso).getTime()) / 60_000
      const etaHin = v.etaVomLeadMin // Vortermin-Ort ↔ Besichtigung (Symmetrie-Annahme)
      const etaZurueck = n.etaVomLeadMin // Besichtigung ↔ Folgetermin-Ort
      const benoetigt = (etaHin ?? 0) + (etaZurueck ?? 0) + BESICHTIGUNG_MIN
      const reicht = etaHin != null && etaZurueck != null && benoetigt <= luckeMin
      out.push({
        key: `${v.id}-${n.id}`,
        vonIso: v.endIso,
        bisIso: n.startIso,
        luckeMin: Math.round(luckeMin),
        etaHinMin: etaHin,
        etaZurueckMin: etaZurueck,
        reicht,
      })
    }
    return out
  }, [termineHeute])

  // Vor- + Nach-Slot für Tagesrand (vor erstem / nach letztem Termin)
  const randSlots = useMemo(() => {
    if (termineHeute.length === 0) return { vor: null as null | { etaMin: number | null; bisIso: string }, nach: null as null | { etaMin: number | null; vonIso: string } }
    const erst = termineHeute[0]
    const letzt = termineHeute[termineHeute.length - 1]
    return {
      vor: { etaMin: erst.etaVomLeadMin, bisIso: erst.startIso },
      nach: { etaMin: letzt.etaVomLeadMin, vonIso: letzt.endIso },
    }
  }, [termineHeute])

  // Stunden-Marker
  const hours = useMemo(() => {
    const arr: number[] = []
    for (let h = HOUR_START; h <= HOUR_END; h++) arr.push(h)
    return arr
  }, [])

  // ─── Klick-zu-Reservieren: Y-Position → 15-min-gerundete Zeit ──────────
  function handleRailClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!activeDayKey || !activeSvId) return
    // Klicks auf bestehende Termin-Blöcke ignorieren
    const target = e.target as HTMLElement
    if (target.closest('[data-termin-block]')) return
    if (!railRef.current) return
    const rect = railRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    if (y < 0 || y > RAIL_HEIGHT) return
    const minFromStart = Math.round(y / PX_PER_MIN / 15) * 15
    const totalMinutes = HOUR_START * 60 + minFromStart
    const hh = Math.floor(totalMinutes / 60)
    const mm = totalMinutes % 60
    if (hh < HOUR_START || hh >= HOUR_END) return
    // ISO-String aus activeDayKey + Uhrzeit (lokale Zeit)
    const [yyyy, mo, dd] = activeDayKey.split('-').map(Number)
    const dt = new Date(yyyy, mo - 1, dd, hh, mm, 0, 0)
    if (dt.getTime() < Date.now()) {
      setReserveError('Liegt in der Vergangenheit')
      setTimeout(() => setReserveError(null), 2500)
      return
    }
    setReserveDraft({ startIso: dt.toISOString(), dauerMin: TERMIN_DAUER_DEFAULT })
    setReserveError(null)
  }

  function ueberlapptMitTermin(startIso: string, dauerMin: number): boolean {
    const start = new Date(startIso).getTime()
    const end = start + dauerMin * 60_000
    return termineHeute.some((t) => {
      const ts = new Date(t.startIso).getTime()
      const te = new Date(t.endIso).getTime()
      return start < te && end > ts
    })
  }

  function handleReserveBestaetigen() {
    if (!reserveDraft || !activeSvId) return
    if (ueberlapptMitTermin(reserveDraft.startIso, reserveDraft.dauerMin)) {
      setReserveError('Slot überlappt mit einem bestehenden Termin')
      return
    }
    setReserveError(null)
    startReserve(async () => {
      const r = await reserveSvTerminForLead(leadId, activeSvId, reserveDraft.startIso, reserveDraft.dauerMin)
      if (r.success) {
        setReserveDraft(null)
        onReserved?.()
        router.refresh()
        onClose()
      } else {
        setReserveError(r.error ?? 'Reservierung fehlgeschlagen')
      }
    })
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={1080} hideCloseButton noPadding ariaLabel="SV-Kalender vergleichen">
      <div className="flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-claimondo-border">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarIcon className="w-4 h-4 text-claimondo-ondo shrink-0" />
            <h3 className="text-sm font-semibold text-claimondo-navy">SV-Kalender vergleichen</h3>
            {data?.leadAdresse && (
              <span className="hidden md:flex items-center gap-1 text-[11px] text-claimondo-ondo truncate max-w-md">
                <MapPinIcon className="w-3 h-3 shrink-0" />
                Bezugspunkt: <span className="truncate">{data.leadAdresse}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={loading}
              className="text-[11px] text-claimondo-ondo hover:text-claimondo-navy flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCwIcon className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Neu laden
            </button>
            <button type="button" onClick={onClose} className="text-claimondo-ondo/70 hover:text-claimondo-ondo" aria-label="Schließen">
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SV-Tabs */}
        {data && data.tabs.length > 0 && (
          <div className="flex items-center gap-1 px-3 pt-2 border-b border-claimondo-border overflow-x-auto bg-claimondo-bg">
            {data.tabs.map((tab) => {
              const isActive = activeTab?.svId === tab.svId
              return (
                <button
                  key={tab.svId}
                  type="button"
                  onClick={() => setActiveSvId(tab.svId)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-claimondo-ondo text-claimondo-navy bg-white'
                      : 'border-transparent text-claimondo-ondo hover:text-claimondo-navy hover:bg-white/50'
                  }`}
                >
                  <span>{tab.name}</span>
                  <span className="text-[10px] bg-claimondo-bg text-claimondo-ondo px-1.5 py-0.5 rounded-full border border-claimondo-border">
                    {tab.termine.length}
                  </span>
                  {tab.etaLeadZuBueroMin != null && (
                    <span className="text-[10px] text-claimondo-ondo/70 flex items-center gap-0.5">
                      <NavigationIcon className="w-2.5 h-2.5" />
                      {tab.etaLeadZuBueroMin}m
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Body: Kalender (links) + Tag-Liste (rechts) */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_180px] relative">
          {/* Tageskalender */}
          <div className="overflow-y-auto px-4 py-4 border-r border-claimondo-border">
            {loading && (
              <p className="text-xs text-claimondo-ondo flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-claimondo-ondo animate-pulse" />
                Lade Kalender + Routen …
              </p>
            )}
            {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
            {!loading && !error && data && !data.leadLat && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
                Lead hat keinen Besichtigungsort mit Koordinaten — ETAs können nicht berechnet werden.
              </p>
            )}

            {!loading && !error && activeTab && activeDayKey && (
              <>
                {/* Datum-Header */}
                <div className="flex items-baseline justify-between mb-3">
                  <h4 className="text-sm font-semibold text-claimondo-navy">
                    {new Date(activeDayKey).toLocaleDateString('de-DE', {
                      timeZone: 'Europe/Berlin',
                      weekday: 'long',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </h4>
                  <p className="text-[11px] text-claimondo-ondo">
                    {termineHeute.length === 0
                      ? 'Keine Termine — ganzer Tag verfügbar'
                      : `${termineHeute.length} Termin${termineHeute.length === 1 ? '' : 'e'}`}
                  </p>
                </div>

                {/* Legende */}
                <div className="flex items-center gap-4 mb-2 text-[10px] text-claimondo-ondo flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-amber-200 border border-amber-400" />
                    Termin (belegt)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-400 border-dashed" />
                    Route von/zum Besichtigungsort
                  </span>
                  <span className="flex items-center gap-1.5 text-claimondo-ondo">
                    <CalendarPlusIcon className="w-3 h-3" />
                    Klick auf freien Bereich → Termin reservieren
                  </span>
                </div>

                {/* Vor erstem Termin — Anfahrt zum SV */}
                {randSlots.vor && (
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
                    <NavigationIcon className="w-3 h-3" />
                    <span>
                      Tagesstart frei — bis zum 1. Termin um {fmtTime(randSlots.vor.bisIso)}
                      {randSlots.vor.etaMin != null && (
                        <>
                          {' '}· <span className="font-medium">{randSlots.vor.etaMin} min</span> vom Besichtigungsort
                        </>
                      )}
                    </span>
                  </div>
                )}

                {/* Tageskalender-Rail — Klick auf freie Bereiche reserviert Slot */}
                <div
                  ref={railRef}
                  onClick={handleRailClick}
                  className="relative ml-12 cursor-pointer"
                  style={{ height: `${RAIL_HEIGHT}px` }}
                  title="Klick auf einen freien Bereich reserviert einen 45-Min-Termin"
                >
                  {/* Stunden-Linien */}
                  {hours.map((h) => {
                    const top = (h - HOUR_START) * 60 * PX_PER_MIN
                    return (
                      <div key={h} className="absolute left-0 right-0 border-t border-claimondo-border" style={{ top }}>
                        <span className="absolute -top-2 -left-12 text-[10px] font-medium text-claimondo-ondo/70 w-10 text-right pr-1">
                          {String(h).padStart(2, '0')}:00
                        </span>
                      </div>
                    )
                  })}

                  {/* Route-Marker zwischen Terminen (BLAU) — werden VOR den
                      gelben Termin-Blöcken gerendert, damit sie im Hintergrund
                      sind und sich nicht überlappen. */}
                  {/* 2026-05-07 (Aaron-Smoke): Lücken-Boxen sind jetzt
                      klickbar — Click ins Slot-Mitte legt einen reserveDraft
                      mit Slot-Anfang+ETA-hin als optimaler Termin-Start.
                      Damit „klick zum legen" direkt aus dem visuellen
                      Lücken-Hinweis funktioniert ohne Rail-Hit-Test. */}
                  {lueckenHeute.map((l) => {
                    const startMin = minutesOfDay(l.vonIso) - HOUR_START * 60
                    const endMin = minutesOfDay(l.bisIso) - HOUR_START * 60
                    if (endMin <= 0 || startMin >= TOTAL_MIN) return null
                    const top = Math.max(0, startMin) * PX_PER_MIN
                    const height = Math.max(20, (Math.min(TOTAL_MIN, endMin) - Math.max(0, startMin)) * PX_PER_MIN)
                    const handleSlotClick = () => {
                      if (!l.reicht) return
                      // Optimaler Slot-Start: Vortermin-Ende + ETA hin (auf 5 min gerundet)
                      const startMs = new Date(l.vonIso).getTime() + (l.etaHinMin ?? 0) * 60_000
                      const rounded = Math.round(startMs / (5 * 60_000)) * 5 * 60_000
                      setReserveDraft({ startIso: new Date(rounded).toISOString(), dauerMin: TERMIN_DAUER_DEFAULT })
                      setReserveError(null)
                    }
                    return (
                      <button
                        type="button"
                        key={l.key}
                        onClick={handleSlotClick}
                        disabled={!l.reicht}
                        data-termin-block
                        className={`absolute left-0 right-2 rounded-lg border-2 border-dashed flex items-center justify-center text-[10px] px-2 transition-colors ${
                          l.reicht
                            ? 'bg-blue-50 border-blue-300 text-blue-800 cursor-pointer hover:bg-blue-100 hover:border-blue-400'
                            : 'bg-red-50 border-red-300 text-red-700 cursor-not-allowed'
                        }`}
                        style={{ top, height }}
                        title={l.reicht ? 'Tippen zum Reservieren' : 'Zu kurz für Anfahrt + Besichtigung'}
                      >
                        <div className="text-center leading-tight">
                          {l.etaHinMin != null && l.etaZurueckMin != null ? (
                            <>
                              <div className="font-medium">
                                {l.etaHinMin} min hin · {l.etaZurueckMin} min zurück
                              </div>
                              <div className="opacity-80">
                                {l.luckeMin} min Lücke {l.reicht ? '· passt — tippen' : '· zu kurz'}
                              </div>
                            </>
                          ) : (
                            <div className="opacity-80">{l.luckeMin} min Lücke</div>
                          )}
                        </div>
                      </button>
                    )
                  })}

                  {/* 2026-05-07: Provisorischer Lead-Termin-Block (BLAU
                      gefüllt) sobald reserveDraft an dem Tag liegt. So
                      sieht der Dispatcher visuell wo der neue Termin
                      hingelegt wird, vor der Bestätigung. */}
                  {reserveDraft && dayKey(reserveDraft.startIso) === activeDayKey && (() => {
                    const startMin = minutesOfDay(reserveDraft.startIso) - HOUR_START * 60
                    const endMin = startMin + reserveDraft.dauerMin
                    if (endMin <= 0 || startMin >= TOTAL_MIN) return null
                    const top = Math.max(0, startMin) * PX_PER_MIN
                    const heightPx = Math.max(28, (Math.min(TOTAL_MIN, endMin) - Math.max(0, startMin)) * PX_PER_MIN)
                    return (
                      <div
                        className="absolute left-0 right-2 rounded-lg border-2 border-blue-600 bg-blue-500/85 text-white px-2 py-1.5 shadow-lg z-10"
                        style={{ top, height: heightPx }}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                          <ClockIcon className="w-3 h-3" />
                          {fmtTime(reserveDraft.startIso)} — Neuer Termin
                        </div>
                        {data?.leadAdresse && (
                          <p className="text-[10px] opacity-90 truncate flex items-center gap-1 mt-0.5">
                            <MapPinIcon className="w-2.5 h-2.5 shrink-0" />
                            {data.leadAdresse}
                          </p>
                        )}
                        <p className="text-[10px] opacity-90 mt-0.5">
                          Bitte unten bestätigen
                        </p>
                      </div>
                    )
                  })()}

                  {/* Termin-Blöcke (GELB) */}
                  {termineHeute.map((t) => {
                    const startMin = minutesOfDay(t.startIso) - HOUR_START * 60
                    const endMin = minutesOfDay(t.endIso) - HOUR_START * 60
                    if (endMin <= 0 || startMin >= TOTAL_MIN) return null
                    const top = Math.max(0, startMin) * PX_PER_MIN
                    const height = Math.max(28, (Math.min(TOTAL_MIN, endMin) - Math.max(0, startMin)) * PX_PER_MIN)
                    const istWunsch =
                      wunschterminIso &&
                      dayKey(wunschterminIso) === activeDayKey &&
                      Math.abs(new Date(wunschterminIso).getTime() - new Date(t.startIso).getTime()) < 30 * 60_000
                    return (
                      <div
                        key={t.id}
                        data-termin-block
                        className={`absolute left-0 right-2 rounded-lg border-2 px-2 py-1.5 shadow-sm overflow-hidden cursor-not-allowed ${
                          istWunsch
                            ? 'bg-amber-300 border-amber-500'
                            : 'bg-amber-100 border-amber-400'
                        }`}
                        style={{ top, height }}
                        title={`Belegt: ${t.ortAdresse ?? 'kein Ort'}`}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-900">
                          <ClockIcon className="w-3 h-3" />
                          {fmtTime(t.startIso)} – {fmtTime(t.endIso)}
                        </div>
                        {t.ortAdresse && (
                          <p className="text-[10px] text-amber-900/80 truncate flex items-center gap-1 mt-0.5">
                            <MapPinIcon className="w-2.5 h-2.5 shrink-0" />
                            {t.ortAdresse}
                          </p>
                        )}
                        {t.etaVomLeadMin != null && (
                          <p className="text-[10px] text-amber-900/70 mt-0.5">
                            {t.etaVomLeadMin} min ab Besichtigungsort
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Nach letztem Termin — Restliche Zeit */}
                {randSlots.nach && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
                    <NavigationIcon className="w-3 h-3" />
                    <span>
                      Nach letztem Termin ab {fmtTime(randSlots.nach.vonIso)} frei
                      {randSlots.nach.etaMin != null && (
                        <>
                          {' '}· <span className="font-medium">{randSlots.nach.etaMin} min</span> zum Besichtigungsort
                        </>
                      )}
                    </span>
                  </div>
                )}

                {/* Wenn ganzer Tag leer */}
                {termineHeute.length === 0 && (
                  <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
                    <NavigationIcon className="w-3 h-3" />
                    Ganzer Tag verfügbar
                    {activeTab.etaLeadZuBueroMin != null && (
                      <>
                        {' '}— vom Besichtigungsort sind es ca.{' '}
                        <span className="font-medium">{activeTab.etaLeadZuBueroMin} min</span> bis zum SV-Büro
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Reserve-Confirm als Floating-Card im Body */}
          {reserveDraft && activeTab && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-claimondo-navy/30 backdrop-blur-[2px] p-4"
              onClick={() => !reservePending && setReserveDraft(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-xl border border-claimondo-border p-5 max-w-sm w-full space-y-3"
              >
                <div className="flex items-center gap-2">
                  <CalendarPlusIcon className="w-4 h-4 text-claimondo-ondo" />
                  <h4 className="text-sm font-semibold text-claimondo-navy">Termin reservieren</h4>
                </div>
                <p className="text-xs text-claimondo-ondo">
                  Bei <span className="font-medium text-claimondo-navy">{activeTab.name}</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-claimondo-ondo uppercase tracking-wider block mb-1">Start</label>
                    <input
                      type="datetime-local"
                      value={(() => {
                        const d = new Date(reserveDraft.startIso)
                        const p = (n: number) => String(n).padStart(2, '0')
                        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
                      })()}
                      onChange={(e) => {
                        if (!e.target.value) return
                        setReserveDraft({ ...reserveDraft, startIso: new Date(e.target.value).toISOString() })
                      }}
                      className="w-full bg-claimondo-bg border border-claimondo-border text-claimondo-navy text-xs rounded-lg px-2 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-claimondo-ondo uppercase tracking-wider block mb-1">Dauer</label>
                    <select
                      value={reserveDraft.dauerMin}
                      onChange={(e) => setReserveDraft({ ...reserveDraft, dauerMin: Number(e.target.value) })}
                      className="w-full bg-claimondo-bg border border-claimondo-border text-claimondo-navy text-xs rounded-lg px-2 py-1.5"
                    >
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min</option>
                      <option value={90}>90 min</option>
                    </select>
                  </div>
                </div>

                {reserveError && (
                  <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                    {reserveError}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={reservePending}
                    onClick={() => setReserveDraft(null)}
                    className="flex-1 px-3 py-2 rounded-lg border border-claimondo-border text-claimondo-navy text-xs font-medium hover:bg-claimondo-bg disabled:opacity-50"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    disabled={reservePending}
                    onClick={handleReserveBestaetigen}
                    className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CalendarPlusIcon className="w-3.5 h-3.5" />
                    {reservePending ? 'Reserviere …' : 'Reservieren'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tag-Liste rechts */}
          {data && (
            <div className="overflow-y-auto bg-claimondo-bg">
              <ul className="divide-y divide-claimondo-border">
                {tage.map((tag) => {
                  const isActive = tag.key === activeDayKey
                  const cnt = activeSvId ? (tag.anzahlTermine.get(activeSvId) ?? 0) : 0
                  const istWunschTag = wunschterminIso ? dayKey(wunschterminIso) === tag.key : false
                  return (
                    <li key={tag.key}>
                      <button
                        type="button"
                        onClick={() => setActiveDayKey(tag.key)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                          isActive
                            ? 'bg-white border-l-2 border-claimondo-ondo'
                            : 'border-l-2 border-transparent hover:bg-white/60'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs font-medium ${isActive ? 'text-claimondo-navy' : 'text-claimondo-ondo'}`}>
                            {fmtDayShort(tag.tagIso)}
                          </span>
                          {istWunschTag && (
                            <span className="text-[9px] font-semibold bg-claimondo-ondo text-white px-1 py-0.5 rounded-full">
                              Wunsch
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            cnt > 0
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {cnt > 0 ? `${cnt}` : 'frei'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
