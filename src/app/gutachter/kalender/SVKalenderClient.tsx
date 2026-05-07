'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks,
  format, isSameDay, isToday, isBefore, startOfDay,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { setTermin, ablehnTerminAction, gegenvorschlagAction } from './actions'
import { Modal } from '@/components/primitives/Modal'
import { StatusBadge } from '@/components/shared/StatusBadge'

type Fall = {
  id: string
  fall_nummer: string | null
  sv_termin: string | null
  status: string
  schadens_ort: string | null
  schadens_adresse: string | null
  lead_id: string | null
  gutachter_termin_status: string | null
}

type GutachterTermin = {
  id: string
  fall_id: string
  status: string
  final_verbindlich_ab: string | null
}

type DailyW = { date: string; tempMax: number; tempMin: number; code: number }
function wEmoji(c: number) { return c === 0 ? '☀️' : c <= 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌦️' : '⛈️' }

// 2026-05-06: HH:mm in Europe/Berlin formatieren — stabil zwischen
// Vercel-SSR (UTC) und Browser. date-fns format() nutzt die jeweilige
// Local-TZ, was bei SSR zu 2h-Versatz im Sommer führte (UTC-Wall ≠
// Berlin-Wall). Intl.DateTimeFormat mit explicit timeZone löst das.
function formatBerlinTime(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

// 2026-05-06: Time-Match — externalBusy-Event auf internen Claimondo-
// Termin mappen damit der „Gebucht"-Pill klickbar zum Auftrag wird.
// Toleranz 2 Min (Google FreeBusy gibt teils Sekunden-Drift zurück).
const TIME_MATCH_TOLERANCE_MS = 2 * 60 * 1000
function findMatchingFallId(
  externalStart: string,
  candidates: Array<{ fallId: string; startMs: number }> | undefined,
): string | null {
  if (!candidates || candidates.length === 0) return null
  const externalMs = new Date(externalStart).getTime()
  const hit = candidates.find((c) => Math.abs(c.startMs - externalMs) < TIME_MATCH_TOLERANCE_MS)
  return hit?.fallId ?? null
}

export default function SVKalenderClient({
  faelle,
  leadMap,
  gcalConnected,
  standortLat,
  standortLng,
  termine,
  externalBusy,
  verlegteSlots,
  claimondoTermineByStart,
}: {
  faelle: Fall[]
  leadMap: Record<string, string>
  svId: string
  gcalConnected: boolean
  standortLat?: number | null
  standortLng?: number | null
  termine?: GutachterTermin[]
  // AAR-google-cal-drift: externe Google-Termine als geblockte Zeitfenster
  externalBusy?: { start: string; end: string }[]
  // AAR-864: verlegt-Slots — gedimmter „Privater Termin"-Block, blockt
  // weiter den Slot bis der Kunde entscheidet
  verlegteSlots?: { id: string; start: string; end: string }[]
  // 2026-05-06: Time-Match damit externalBusy-Pills klickbar zum Auftrag
  // werden wenn sie zeitlich zu einem internen gutachter_termine matchen.
  claimondoTermineByStart?: Array<{ fallId: string; startMs: number }>
}) {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [dialogFall, setDialogFall] = useState<Fall | null>(null)
  const [terminDate, setTerminDate] = useState('')
  const [terminTime, setTerminTime] = useState('10:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dailyWeather, setDailyWeather] = useState<Record<string, DailyW>>({})

  // KFZ-192: Ablehnen/Gegenvorschlag Modal State
  const [svAktionModal, setSvAktionModal] = useState<{
    type: 'ablehnen' | 'gegenvorschlag'
    termin: GutachterTermin
  } | null>(null)
  const [ablehnenGrund, setAblehnenGrund] = useState('')
  const [gegSlots, setGegSlots] = useState([{ datum: '', uhrzeit: '10:00' }])
  const [svAktionSaving, setSvAktionSaving] = useState(false)
  const [svAktionError, setSvAktionError] = useState<string | null>(null)

  // Hilfsfunktion: Hat Termin noch ein offenes Zeitfenster zur Ablehnung?
  function kannTerminAblehnen(t: GutachterTermin) {
    if (!t.final_verbindlich_ab) return true // kein Limit gesetzt → noch möglich
    return new Date(t.final_verbindlich_ab) > new Date()
  }

  // Termin-Map: fall_id → GutachterTermin
  const terminMapByFall = useMemo(() => {
    const map: Record<string, GutachterTermin> = {}
    for (const t of termine ?? []) {
      map[t.fall_id] = t
    }
    return map
  }, [termine])

  async function handleSvAblehnen() {
    if (!svAktionModal || svAktionModal.type !== 'ablehnen') return
    setSvAktionSaving(true)
    setSvAktionError(null)
    const result = await ablehnTerminAction(svAktionModal.termin.id, ablehnenGrund)
    setSvAktionSaving(false)
    if (!result.success) { setSvAktionError(result.error ?? 'Fehler'); return }
    setSvAktionModal(null)
    setAblehnenGrund('')
    router.refresh()
  }

  async function handleSvGegenvorschlag() {
    if (!svAktionModal || svAktionModal.type !== 'gegenvorschlag') return
    const filledSlots = gegSlots.filter(s => s.datum && s.uhrzeit)
    if (filledSlots.length === 0) { setSvAktionError('Mindestens einen Slot angeben'); return }
    setSvAktionSaving(true)
    setSvAktionError(null)
    const result = await gegenvorschlagAction(svAktionModal.termin.id, filledSlots)
    setSvAktionSaving(false)
    if (!result.success) { setSvAktionError(result.error ?? 'Fehler'); return }
    setSvAktionModal(null)
    setGegSlots([{ datum: '', uhrzeit: '10:00' }])
    router.refresh()
  }

  // Fetch 7-day weather forecast
  useEffect(() => {
    if (!standortLat || !standortLng) return
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${standortLat}&longitude=${standortLng}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe/Berlin&forecast_days=7`)
      .then(r => r.json()).then(d => {
        if (!d.daily?.time) return
        const map: Record<string, DailyW> = {}
        for (let i = 0; i < d.daily.time.length; i++) {
          map[d.daily.time[i]] = { date: d.daily.time[i], tempMax: Math.round(d.daily.temperature_2m_max[i]), tempMin: Math.round(d.daily.temperature_2m_min[i]), code: d.daily.weathercode[i] }
        }
        setDailyWeather(map)
      }).catch(() => {})
  }, [standortLat, standortLng])

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    const end = endOfWeek(currentDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  const terminFaelle = faelle.filter(f => f.sv_termin)
  const ohneTermin = faelle.filter(f => !f.sv_termin)

  function getEntriesForDay(day: Date) {
    // 2026-05-06: ASC nach Uhrzeit sortieren — sonst stehen 16:00 oben
    // und 08:00 unten (zufällig in DB-Reihenfolge). User-Erwartung:
    // 8 oben, 16 unten.
    return terminFaelle
      .filter((f) => isSameDay(new Date(f.sv_termin!), day))
      .sort(
        (a, b) =>
          new Date(a.sv_termin!).getTime() - new Date(b.sv_termin!).getTime(),
      )
  }

  async function handleSetTermin() {
    if (!dialogFall || !terminDate) return
    setSaving(true)
    setError(null)
    try {
      const dt = `${terminDate}T${terminTime}:00`
      await setTermin(dialogFall.id, dt)
      setDialogFall(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  const HOURS = Array.from({ length: 11 }, (_, i) => i + 7) // 7:00-17:00

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sticky Topbar — 2026-05-07 Mobile-Polish: Vorher überlappten der
          „Google Calendar verbinden"-Button und die Wochen-Pagination auf
          390er-Mobile. Jetzt: flex-col-Stack auf Mobile, Pagination eigene
          Zeile, GCal-Connect nur noch Icon (Label ab sm sichtbar). */}
      <div className="flex-shrink-0 bg-white border-b border-claimondo-border px-4 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-claimondo-navy">Kalender</h1>
            <p className="text-claimondo-ondo text-xs truncate">
              {format(weekDays[0], 'd. MMM', { locale: de })} – {format(weekDays[6], 'd. MMM yyyy', { locale: de })}
            </p>
          </div>
          {gcalConnected ? (
            <div className="sm:hidden shrink-0">
              <StatusBadge tone="success">Verbunden</StatusBadge>
            </div>
          ) : (
            <a
              href="/api/auth/google/connect?return=/gutachter/kalender"
              className="sm:hidden shrink-0 inline-flex items-center justify-center w-9 h-9 bg-white border border-claimondo-border hover:shadow-md rounded-lg transition-shadow"
              aria-label="Google Calendar verbinden"
              title="Google Calendar verbinden"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 justify-between sm:justify-end">
          {gcalConnected ? (
            <div className="hidden sm:block">
              <StatusBadge tone="success">Google Calendar verbunden</StatusBadge>
            </div>
          ) : (
            <a
              href="/api/auth/google/connect?return=/gutachter/kalender"
              className="hidden sm:flex items-center gap-2 bg-white border border-claimondo-border hover:shadow-md text-sm font-medium px-3 py-1.5 rounded-lg transition-shadow"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Google Calendar verbinden
            </a>
          )}
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="px-2.5 sm:px-3 py-1.5 text-xs text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg rounded-lg transition-colors">← <span className="hidden sm:inline">Zurück</span></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-2.5 sm:px-3 py-1.5 text-xs text-claimondo-navy hover:text-claimondo-navy hover:bg-claimondo-bg rounded-lg transition-colors font-medium">Heute</button>
            <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="px-2.5 sm:px-3 py-1.5 text-xs text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg rounded-lg transition-colors"><span className="hidden sm:inline">Weiter</span> →</button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {/* Week calendar grid */}
        <div className="bg-white rounded-2xl border border-claimondo-border overflow-hidden mb-6">
          <div className="grid grid-cols-7">
            {weekDays.map((day, i) => {
              const entries = getEntriesForDay(day)
              const today = isToday(day)
              const dayKey = format(day, 'yyyy-MM-dd')
              const dayW = dailyWeather[dayKey]
              return (
                <div key={i} className={`border-r border-claimondo-border/50 last:border-r-0 min-h-48 ${today ? 'bg-claimondo-bg/30' : ''}`}>
                  {/* Day header */}
                  <div className="px-2 py-2 border-b border-claimondo-border/50 text-center">
                    <span className="text-claimondo-ondo text-[10px] uppercase">{format(day, 'EEE', { locale: de })}</span>
                    <div className={`text-sm font-medium mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full ${
                      today ? 'bg-[var(--brand-primary)] text-white' : 'text-claimondo-navy'
                    }`}>
                      {format(day, 'd')}
                    </div>
                    {dayW && (
                      <div className="mt-0.5">
                        <span className="text-xs">{wEmoji(dayW.code)}</span>
                        <span className="text-[9px] text-claimondo-ondo ml-0.5">{dayW.tempMax}°</span>
                      </div>
                    )}
                  </div>

                  {/* Entries */}
                  <div className="p-1.5 space-y-1">
                    {/* AAR-google-cal-drift: externe Google-/CalDAV-Termine
                        als geblockte Slots anzeigen.
                        2026-05-06: Wenn ein externer Termin zeitlich zu einem
                        internen gutachter_termine matched (CalDAV-Readback
                        unseres eigenen Sync-Writes), wird er hier UNTER-
                        DRÜCKT — die interne Termin-Card unten rendert die
                        Auftrag-Daten klickbar. Sonst Doppel-Render. */}
                    {(externalBusy ?? [])
                      .filter((b) => {
                        const bs = new Date(b.start)
                        const sameDay =
                          bs.getFullYear() === day.getFullYear() &&
                          bs.getMonth() === day.getMonth() &&
                          bs.getDate() === day.getDate()
                        if (!sameDay) return false
                        // Match auf interne Termine → unterdrücken (Card
                        // rendert eh).
                        const internalMatch = findMatchingFallId(b.start, claimondoTermineByStart)
                        return internalMatch == null
                      })
                      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                      .map((b, idx) => {
                        const bs = new Date(b.start)
                        const be = new Date(b.end)
                        return (
                          <div
                            key={`busy-${idx}`}
                            className="px-2 py-1 rounded-lg text-[10px] leading-tight bg-claimondo-bg text-claimondo-ondo border border-claimondo-border"
                            title="Externer Privattermin — blockiert"
                          >
                            <div className="font-medium">
                              {formatBerlinTime(bs)}–{formatBerlinTime(be)}
                            </div>
                            <div className="truncate">Gebucht</div>
                          </div>
                        )
                      })}
                    {/* AAR-864: verlegt-Slots als gedimmter „Privater Termin"-Block */}
                    {(verlegteSlots ?? [])
                      .filter((v) => {
                        const vs = new Date(v.start)
                        return vs.getFullYear() === day.getFullYear()
                          && vs.getMonth() === day.getMonth()
                          && vs.getDate() === day.getDate()
                      })
                      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                      .map((v) => {
                        const vs = new Date(v.start)
                        const ve = new Date(v.end)
                        return (
                          <div
                            key={`verlegt-${v.id}`}
                            className="px-2 py-1 rounded-lg text-[10px] leading-tight bg-claimondo-border/30 text-claimondo-ondo/70 border border-claimondo-border/60 italic"
                            title="Verlegung beantragt — Slot blockiert bis Kunde entscheidet"
                          >
                            <div className="font-medium not-italic">
                              {formatBerlinTime(vs)}–{formatBerlinTime(ve)}
                            </div>
                            <div className="truncate">Gebucht</div>
                          </div>
                        )
                      })}
                    {entries.map(fall => {
                      const time = fall.sv_termin ? formatBerlinTime(fall.sv_termin) : ''
                      const overdue = fall.sv_termin && isBefore(new Date(fall.sv_termin), startOfDay(new Date()))
                      const isReserviert = fall.gutachter_termin_status === 'reserviert'
                      // AAR-864: pending Verlegung — gestrichelt amber
                      const isVerlegungPending = fall.gutachter_termin_status === 'verlegung_pending'
                      // KFZ-192: Zugehörigen gutachter_termine Eintrag finden
                      const gtTermin = terminMapByFall[fall.id]
                      const darfAblehnen = gtTermin && kannTerminAblehnen(gtTermin) && isReserviert
                      return (
                        <div key={fall.id} className="space-y-0.5">
                          <Link
                            href={`/gutachter/fall/${fall.id}`}
                            className={`block px-2 py-1.5 rounded-lg text-[10px] leading-tight transition-colors ${
                              overdue
                                ? 'bg-red-50/80 text-red-300 hover:bg-red-900/80'
                                : isVerlegungPending
                                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-2 border-dashed border-amber-400'
                                  : isReserviert
                                    ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                    : 'bg-[var(--brand-secondary)]/10 text-[var(--brand-accent)] hover:bg-[var(--brand-primary)]/80'
                            }`}
                          >
                            <div className="font-medium">
                              {time}
                              {isReserviert && <span className="ml-1 text-[8px] opacity-70">(reserviert)</span>}
                              {isVerlegungPending && <span className="ml-1 text-[8px] opacity-80">(Verlegung pending)</span>}
                            </div>
                            <div className="truncate">{fall.fall_nummer ?? fall.id.slice(0, 8)}</div>
                            {fall.lead_id && (
                              <div className="truncate text-[9px] opacity-70">{leadMap[fall.lead_id] ?? ''}</div>
                            )}
                          </Link>
                          {/* KFZ-192: Ablehnen/Gegenvorschlag Buttons (nur wenn noch möglich) */}
                          {darfAblehnen && (
                            <div className="flex gap-0.5">
                              <button
                                onClick={() => { setSvAktionModal({ type: 'gegenvorschlag', termin: gtTermin }); setGegSlots([{ datum: '', uhrzeit: '10:00' }]); setSvAktionError(null) }}
                                className="flex-1 text-[8px] px-1 py-0.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded transition-colors"
                              >Vorschlag</button>
                              <button
                                onClick={() => { setSvAktionModal({ type: 'ablehnen', termin: gtTermin }); setAblehnenGrund(''); setSvAktionError(null) }}
                                className="flex-1 text-[8px] px-1 py-0.5 bg-red-50 text-red-500 hover:bg-red-100 rounded transition-colors"
                              >Ablehnen</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Cases without appointment */}
        {ohneTermin.length > 0 && (
          <div className="bg-white rounded-2xl border border-claimondo-border p-5">
            <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider mb-3">
              Ohne Termin ({ohneTermin.length})
            </h2>
            <div className="space-y-2">
              {ohneTermin.map(fall => (
                <div key={fall.id} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl bg-claimondo-bg/40">
                  <div className="min-w-0">
                    <Link href={`/gutachter/fall/${fall.id}`} className="text-[var(--brand-accent)] hover:text-[var(--brand-accent)] text-xs font-mono">
                      {fall.fall_nummer ?? fall.id.slice(0, 8)}
                    </Link>
                    <p className="text-claimondo-ondo text-xs truncate">
                      {fall.lead_id ? leadMap[fall.lead_id] : '—'} · {fall.schadens_ort ?? '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => { setDialogFall(fall); setTerminDate(''); setTerminTime('10:00') }}
                    className="px-3 py-1.5 bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                  >
                    Termin setzen
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Set termin dialog */}
        <Modal open={dialogFall !== null} onClose={() => setDialogFall(null)} maxWidth={384} ariaLabel="Termin setzen">
          {dialogFall && (
            <>
              <h2 className="text-claimondo-navy font-semibold mb-1">Termin setzen</h2>
                <p className="text-claimondo-ondo text-xs mb-4">
                  Fall {dialogFall.fall_nummer ?? dialogFall.id.slice(0, 8)}
                </p>

                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-claimondo-ondo text-xs mb-1">Datum</label>
                    <input
                      type="date"
                      value={terminDate}
                      onChange={e => setTerminDate(e.target.value)}
                      className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-claimondo-ondo text-xs mb-1">Uhrzeit</label>
                    <input
                      type="time"
                      value={terminTime}
                      onChange={e => setTerminTime(e.target.value)}
                      className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    />
                  </div>
                </div>

                {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

                <div className="flex gap-2">
                  <button onClick={() => setDialogFall(null)} className="flex-1 py-2.5 rounded-xl text-sm text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg transition-colors">
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSetTermin}
                    disabled={saving || !terminDate}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white transition-colors disabled:opacity-40"
                  >
                    {saving ? 'Wird gesetzt...' : 'Speichern'}
                  </button>
                </div>
            </>
          )}
        </Modal>

        {/* KFZ-192: Ablehnen Modal */}
        <Modal open={svAktionModal?.type === 'ablehnen'} onClose={() => setSvAktionModal(null)} maxWidth={384} ariaLabel="Termin ablehnen">
          <h2 className="text-claimondo-navy font-semibold mb-1 text-red-600">Termin ablehnen</h2>
                <p className="text-claimondo-ondo text-xs mb-4">
                  Bitte geben Sie einen Grund an (optional). Dieser wird dem Admin mitgeteilt.
                </p>
                <textarea
                  value={ablehnenGrund}
                  onChange={e => setAblehnenGrund(e.target.value)}
                  placeholder="Ablehnungsgrund (z.B. Terminkonflikt, Krankheit ...)"
                  rows={3}
                  className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-red-300 mb-4 resize-none"
                />
                {svAktionError && <p className="text-red-400 text-xs mb-3">{svAktionError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setSvAktionModal(null)} className="flex-1 py-2.5 rounded-xl text-sm text-claimondo-ondo hover:bg-claimondo-bg transition-colors">
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSvAblehnen}
                    disabled={svAktionSaving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-40"
                  >
                    {svAktionSaving ? 'Wird abgelehnt...' : 'Ablehnen'}
                  </button>
                </div>
        </Modal>

        {/* KFZ-192: Gegenvorschlag Modal */}
        <Modal open={svAktionModal?.type === 'gegenvorschlag'} onClose={() => setSvAktionModal(null)} maxWidth={384} ariaLabel="Alternative Termine">
          <h2 className="text-claimondo-navy font-semibold mb-1">Alternative Termine vorschlagen</h2>
                <p className="text-claimondo-ondo text-xs mb-4">
                  Schlagen Sie 1–3 alternative Termine vor.
                </p>
                <div className="space-y-2 mb-4">
                  {gegSlots.map((slot, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="date"
                        value={slot.datum}
                        onChange={e => setGegSlots(prev => prev.map((s, i) => i === idx ? { ...s, datum: e.target.value } : s))}
                        className="flex-1 bg-claimondo-bg border border-claimondo-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]"
                      />
                      <input
                        type="time"
                        value={slot.uhrzeit}
                        onChange={e => setGegSlots(prev => prev.map((s, i) => i === idx ? { ...s, uhrzeit: e.target.value } : s))}
                        className="w-24 bg-claimondo-bg border border-claimondo-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)]"
                      />
                      {gegSlots.length > 1 && (
                        <button onClick={() => setGegSlots(prev => prev.filter((_, i) => i !== idx))} className="text-claimondo-ondo/70 hover:text-red-500 text-xs px-1">✕</button>
                      )}
                    </div>
                  ))}
                  {gegSlots.length < 3 && (
                    <button
                      onClick={() => setGegSlots(prev => [...prev, { datum: '', uhrzeit: '10:00' }])}
                      className="text-xs text-[var(--brand-secondary)] hover:underline mt-1"
                    >
                      + Weiteren Termin hinzufügen
                    </button>
                  )}
                </div>
                {svAktionError && <p className="text-red-400 text-xs mb-3">{svAktionError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setSvAktionModal(null)} className="flex-1 py-2.5 rounded-xl text-sm text-claimondo-ondo hover:bg-claimondo-bg transition-colors">
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSvGegenvorschlag}
                    disabled={svAktionSaving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-40"
                  >
                    {svAktionSaving ? 'Wird gesendet...' : 'Vorschlag senden'}
                  </button>
                </div>
        </Modal>
      </div>
    </div>
  )
}
