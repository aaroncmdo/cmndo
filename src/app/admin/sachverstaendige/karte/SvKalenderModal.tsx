'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  XIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon,
  PlusIcon, WrenchIcon,
} from 'lucide-react'

const HOUR_START = 8
const HOUR_END = 18
const ROW_H = 48 // px per hour
const TOTAL_H = (HOUR_END - HOUR_START) * ROW_H
const DAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

type Appt = { id: string; start: Date; end: Date; label: string; fallId: string | null; status?: string }

function getMonday(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function minuteToY(min: number) {
  return Math.max(0, Math.min(TOTAL_H, ((min - HOUR_START * 60) / ((HOUR_END - HOUR_START) * 60)) * TOTAL_H))
}

export default function SvKalenderModal({ svId, svName, onClose }: { svId: string; svName: string; onClose: () => void }) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [appointments, setAppointments] = useState<Appt[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingSlot, setBookingSlot] = useState<{ day: Date; minute: number } | null>(null)
  const [bookingFallId, setBookingFallId] = useState('')
  const [booking, setBooking] = useState(false)
  const [unassignedFaelle, setUnassignedFaelle] = useState<{ id: string; fallNr: string; kunde: string }[]>([])

  const today = new Date()
  const nowMinute = today.getHours() * 60 + today.getMinutes()

  // Build 5 weekdays (Mo-Fr)
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const isThisWeek = weekDays.some(d => sameDay(d, today))

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const ds = new Date(weekStart)
    const de = new Date(weekStart); de.setDate(de.getDate() + 5)

    const [gtRes, fallRes, unassRes] = await Promise.all([
      supabase.from('gutachter_termine').select('id, start_zeit, end_zeit, status, fall_id')
        .eq('sv_id', svId).gte('start_zeit', ds.toISOString()).lt('start_zeit', de.toISOString())
        .not('status', 'eq', 'storniert'),
      supabase.from('faelle').select('id, fall_nummer, sv_termin, lead_id, leads(vorname, nachname)')
        .eq('sv_id', svId).not('sv_termin', 'is', null)
        .gte('sv_termin', ds.toISOString()).lt('sv_termin', de.toISOString()),
      supabase.from('faelle').select('id, fall_nummer, lead_id, leads(vorname, nachname)')
        .is('sv_id', null).not('status', 'in', '("abgeschlossen","storniert")')
        .order('created_at', { ascending: false }).limit(20),
    ])

    const appts: Appt[] = []
    const seenFallIds = new Set<string>()
    for (const t of gtRes.data ?? []) {
      appts.push({ id: t.id, start: new Date(t.start_zeit), end: new Date(t.end_zeit), label: t.status === 'reserviert' ? 'Reserviert' : 'Bestätigt', fallId: t.fall_id, status: t.status })
      if (t.fall_id) seenFallIds.add(t.fall_id)
    }
    for (const f of fallRes.data ?? []) {
      if (seenFallIds.has(f.id)) continue
      const lr = f.leads as unknown
      const l = (Array.isArray(lr) ? lr[0] : lr) as { vorname: string | null; nachname: string | null } | null
      const kunde = l ? `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() : ''
      const start = new Date(f.sv_termin!)
      appts.push({ id: f.id, start, end: new Date(start.getTime() + 120 * 60000), label: kunde || f.fall_nummer || 'Termin', fallId: f.id })
    }
    setAppointments(appts)
    setUnassignedFaelle((unassRes.data ?? []).map(f => {
      const lr = f.leads as unknown
      const l = (Array.isArray(lr) ? lr[0] : lr) as { vorname: string | null; nachname: string | null } | null
      return { id: f.id, fallNr: f.fall_nummer ?? f.id.slice(0, 8), kunde: l ? `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() : '\u2014' }
    }))
    setLoading(false)
  }, [svId, weekStart])

  useEffect(() => { loadData() }, [loadData])

  function prevWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n }) }
  function nextWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n }) }
  function thisWeek() { setWeekStart(getMonday(new Date())) }

  function handleSlotClick(day: Date, hourIdx: number) {
    const min = HOUR_START * 60 + hourIdx * 60
    const slotStart = new Date(day); slotStart.setHours(Math.floor(min / 60), 0, 0, 0)
    const slotEnd = new Date(slotStart.getTime() + 120 * 60000)
    const dayAppts = appointments.filter(a => sameDay(a.start, day))
    if (!dayAppts.some(a => a.start < slotEnd && a.end > slotStart)) {
      setBookingSlot({ day, minute: min })
    }
  }

  async function handleBook() {
    if (!bookingSlot || !bookingFallId) return
    setBooking(true)
    const supabase = createClient()
    const startDate = new Date(bookingSlot.day)
    startDate.setHours(Math.floor(bookingSlot.minute / 60), bookingSlot.minute % 60, 0, 0)
    const endDate = new Date(startDate.getTime() + 120 * 60000)
    const { data: inserted } = await supabase.from('gutachter_termine').insert({ sv_id: svId, fall_id: bookingFallId, start_zeit: startDate.toISOString(), end_zeit: endDate.toISOString(), status: 'reserviert', ablehnen_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }).select('id').single()
    await supabase.from('faelle').update({ sv_id: svId, sv_termin: startDate.toISOString(), sv_zugewiesen_am: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', bookingFallId)
    // KFZ-202 Fix: Status via Server Action statt direkt
    try { const { transitionFallStatus } = await import('@/lib/faelle/state-machine'); await transitionFallStatus(bookingFallId, 'sv-termin') } catch { /* Transition evtl. nicht erlaubt */ }
    // KFZ-136: Reminder generieren (fire & forget via internal API)
    if (inserted?.id) { fetch('/api/reminder-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ terminId: inserted.id }) }).catch(() => {}) }
    setBookingSlot(null); setBookingFallId(''); setBooking(false)
    loadData()
  }

  const weekLabel = `${weekDays[0].toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} \u2013 ${weekDays[4].toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#4573A2]" /> {svName}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{appointments.length} Termine &middot; KW {weekLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1 py-0.5">
              <button onClick={prevWeek} className="text-gray-500 hover:text-[#4573A2] p-1 rounded"><ChevronLeftIcon className="w-4 h-4" /></button>
              <button onClick={thisWeek}
                className={`text-xs font-medium px-2 py-0.5 rounded ${isThisWeek ? 'text-[#4573A2] bg-white shadow-sm' : 'text-gray-600 hover:bg-white'}`}>
                Diese Woche
              </button>
              <button onClick={nextWeek} className="text-gray-500 hover:text-[#4573A2] p-1 rounded"><ChevronRightIcon className="w-4 h-4" /></button>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><XIcon className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Week Calendar */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-[#4573A2] rounded-full animate-spin" /></div>
          ) : (
            <div className="flex min-w-0">
              {/* Time labels column */}
              <div className="w-12 flex-shrink-0 border-r border-gray-100">
                {/* Spacer for day header */}
                <div className="h-10 border-b border-gray-200" />
                <div className="relative" style={{ height: TOTAL_H }}>
                  {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => (
                    <div key={i} className="absolute left-0 right-0" style={{ top: i * ROW_H }}>
                      <span className="text-xs text-gray-600 font-medium tabular-nums block text-right pr-2 -mt-1.5 select-none">
                        {String(HOUR_START + i).padStart(2, '0')}:00
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Day columns */}
              {weekDays.map((day, dayIdx) => {
                const isToday = sameDay(day, today)
                const dayAppts = appointments.filter(a => sameDay(a.start, day))

                return (
                  <div key={dayIdx} className={`flex-1 min-w-[120px] border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-blue-50/30' : ''}`}>
                    {/* Day header */}
                    <div className={`h-10 flex flex-col items-center justify-center border-b border-gray-200 ${isToday ? 'bg-[#4573A2]/10' : ''}`}>
                      <span className={`text-[10px] font-medium ${isToday ? 'text-[#4573A2]' : 'text-gray-500'}`}>{DAYS_DE[day.getDay()]}</span>
                      <span className={`text-xs font-semibold tabular-nums ${isToday ? 'text-[#4573A2]' : 'text-gray-700'}`}>
                        {day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>

                    {/* Hour grid + appointments */}
                    <div className="relative" style={{ height: TOTAL_H }}>
                      {/* Hour lines */}
                      {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                        <div key={i} className="absolute left-0 right-0 border-t border-gray-300" style={{ top: i * ROW_H }} />
                      ))}
                      {/* Half-hour dashed lines */}
                      {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                        <div key={`h-${i}`} className="absolute left-0 right-0 border-t border-dashed border-gray-200" style={{ top: i * ROW_H + ROW_H / 2 }} />
                      ))}

                      {/* Clickable hour slots */}
                      {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => {
                        const min = HOUR_START * 60 + i * 60
                        const slotStart = new Date(day); slotStart.setHours(HOUR_START + i, 0, 0, 0)
                        const slotEnd = new Date(slotStart.getTime() + 120 * 60000)
                        const conflict = dayAppts.some(a => a.start < slotEnd && a.end > slotStart)
                        if (conflict) return null
                        return (
                          <div key={`slot-${i}`} className="absolute left-0 right-0 cursor-pointer hover:bg-green-50/60 transition-colors group"
                            style={{ top: i * ROW_H, height: ROW_H }} onClick={() => handleSlotClick(day, i)}>
                            <div className="opacity-0 group-hover:opacity-100 flex items-center justify-center h-full">
                              <PlusIcon className="w-3 h-3 text-green-500" />
                            </div>
                          </div>
                        )
                      })}

                      {/* Appointment blocks */}
                      {dayAppts.map(appt => {
                        const startMin = appt.start.getHours() * 60 + appt.start.getMinutes()
                        const endMin = appt.end.getHours() * 60 + appt.end.getMinutes()
                        const top = minuteToY(startMin)
                        const height = Math.max(20, minuteToY(endMin) - top)
                        return (
                          <Link key={appt.id} href={appt.fallId ? `/admin/faelle/${appt.fallId}` : '#'}
                            className={`absolute left-0.5 right-0.5 rounded-r z-10 overflow-hidden border-l-[3px] transition-colors ${
                              appt.status === 'reserviert'
                                ? 'bg-amber-100/60 border-amber-400 hover:bg-amber-100'
                                : 'bg-[#4573A2]/15 border-[#4573A2] hover:bg-[#4573A2]/25'
                            }`}
                            style={{ top, height }}>
                            <div className="px-1 py-0.5">
                              <span className={`text-[9px] font-semibold tabular-nums block ${
                                appt.status === 'reserviert' ? 'text-amber-600' : 'text-[#4573A2]'
                              }`}>
                                {String(appt.start.getHours()).padStart(2, '0')}:{String(appt.start.getMinutes()).padStart(2, '0')}
                              </span>
                              {height > 28 && <p className="text-[8px] text-gray-600 truncate">{appt.label}</p>}
                            </div>
                          </Link>
                        )
                      })}

                      {/* Red time arrow (today only) */}
                      {isToday && nowMinute >= HOUR_START * 60 && nowMinute <= HOUR_END * 60 && (
                        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: minuteToY(nowMinute) }}>
                          <div className="flex items-center">
                            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                            <div className="flex-1 h-0.5 bg-red-500" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Booking Footer */}
        {bookingSlot !== null && (
          <div className="border-t border-gray-200 px-5 py-3 bg-green-50 flex-shrink-0">
            <p className="text-sm text-green-700 font-medium mb-2">
              Neuer Termin: {DAYS_DE[bookingSlot.day.getDay()]} {bookingSlot.day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} um {String(Math.floor(bookingSlot.minute / 60)).padStart(2, '0')}:00 Uhr (2h Block)
            </p>
            <div className="flex gap-2">
              <select value={bookingFallId} onChange={e => setBookingFallId(e.target.value)}
                className="flex-1 text-sm bg-white border border-green-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-500">
                <option value="">Fall auswaehlen...</option>
                {unassignedFaelle.map(f => <option key={f.id} value={f.id}>{f.fallNr} &mdash; {f.kunde}</option>)}
              </select>
              <button onClick={handleBook} disabled={booking || !bookingFallId}
                className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors">
                {booking ? 'Bucht...' : 'Bestaetigen'}
              </button>
              <button onClick={() => { setBookingSlot(null); setBookingFallId('') }} className="text-gray-500 text-sm px-3 py-2">Abbrechen</button>
            </div>
          </div>
        )}
    </div>
  )
}
