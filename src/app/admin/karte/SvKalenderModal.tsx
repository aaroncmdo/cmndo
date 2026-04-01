'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  XIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon,
  PlusIcon, WrenchIcon,
} from 'lucide-react'

const KAL_HOUR_START = 8
const KAL_HOUR_END = 18
const KAL_SLOT_H = 48
const KAL_TOTAL_SLOTS = (KAL_HOUR_END - KAL_HOUR_START) * 2
const KAL_TOTAL_H = KAL_TOTAL_SLOTS * KAL_SLOT_H

type Appointment = { id: string; start: Date; end: Date; label: string; fallId: string | null }

export default function SvKalenderModal({ svId, svName, onClose }: { svId: string; svName: string; onClose: () => void }) {
  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingSlot, setBookingSlot] = useState<number | null>(null)
  const [bookingFallId, setBookingFallId] = useState('')
  const [booking, setBooking] = useState(false)
  const [unassignedFaelle, setUnassignedFaelle] = useState<{ id: string; fallNr: string; kunde: string }[]>([])

  const isToday = date.toDateString() === new Date().toDateString()
  const nowMinute = new Date().getHours() * 60 + new Date().getMinutes()

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const ds = new Date(date); ds.setHours(0, 0, 0, 0)
    const de = new Date(date); de.setHours(23, 59, 59, 999)
    const [gtRes, fallRes, unassRes] = await Promise.all([
      supabase.from('gutachter_termine').select('id, start_zeit, end_zeit, status, fall_id')
        .eq('sv_id', svId).gte('start_zeit', ds.toISOString()).lte('start_zeit', de.toISOString())
        .not('status', 'eq', 'storniert'),
      supabase.from('faelle').select('id, fall_nummer, sv_termin, lead_id, leads(vorname, nachname)')
        .eq('sv_id', svId).not('sv_termin', 'is', null)
        .gte('sv_termin', ds.toISOString()).lte('sv_termin', de.toISOString()),
      supabase.from('faelle').select('id, fall_nummer, lead_id, leads(vorname, nachname)')
        .is('sv_id', null).not('status', 'in', '("abgeschlossen","storniert")')
        .order('created_at', { ascending: false }).limit(20),
    ])
    const appts: Appointment[] = []
    const seenFallIds = new Set<string>()
    for (const t of gtRes.data ?? []) {
      appts.push({ id: t.id, start: new Date(t.start_zeit), end: new Date(t.end_zeit), label: `Termin ${t.status}`, fallId: t.fall_id })
      if (t.fall_id) seenFallIds.add(t.fall_id)
    }
    for (const f of fallRes.data ?? []) {
      if (seenFallIds.has(f.id)) continue
      const leadRaw = f.leads as unknown
      const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as { vorname: string | null; nachname: string | null } | null
      const kunde = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : ''
      const start = new Date(f.sv_termin!)
      appts.push({ id: f.id, start, end: new Date(start.getTime() + 120 * 60000), label: kunde || f.fall_nummer || 'Termin', fallId: f.id })
    }
    appts.sort((a, b) => a.start.getTime() - b.start.getTime())
    setAppointments(appts)
    setUnassignedFaelle((unassRes.data ?? []).map(f => {
      const lr = f.leads as unknown
      const l = (Array.isArray(lr) ? lr[0] : lr) as { vorname: string | null; nachname: string | null } | null
      return { id: f.id, fallNr: f.fall_nummer ?? f.id.slice(0, 8), kunde: l ? `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() : '\u2014' }
    }))
    setLoading(false)
  }, [svId, date])

  useEffect(() => { loadData() }, [loadData])

  function minuteToY(min: number) {
    return Math.max(0, Math.min(KAL_TOTAL_H, ((min - KAL_HOUR_START * 60) / (KAL_TOTAL_SLOTS * 30)) * KAL_TOTAL_H))
  }

  function handleSlotClick(i: number) {
    const min = KAL_HOUR_START * 60 + i * 30
    const s = new Date(date); s.setHours(Math.floor(min / 60), min % 60, 0, 0)
    const e = new Date(s.getTime() + 120 * 60000)
    if (!appointments.some(a => a.start < e && a.end > s)) setBookingSlot(min)
  }

  async function handleBook() {
    if (bookingSlot === null || !bookingFallId) return
    setBooking(true)
    const supabase = createClient()
    const startDate = new Date(date); startDate.setHours(Math.floor(bookingSlot / 60), bookingSlot % 60, 0, 0)
    const endDate = new Date(startDate.getTime() + 120 * 60000)
    await supabase.from('gutachter_termine').insert({ sv_id: svId, fall_id: bookingFallId, start_zeit: startDate.toISOString(), end_zeit: endDate.toISOString(), status: 'bestaetigt' })
    await supabase.from('faelle').update({ sv_id: svId, sv_termin: startDate.toISOString(), sv_zugewiesen_am: new Date().toISOString(), status: 'sv-termin', updated_at: new Date().toISOString() }).eq('id', bookingFallId)
    setBookingSlot(null); setBookingFallId(''); setBooking(false)
    loadData()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[540px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#4573A2]" /> {svName}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{appointments.length} Termine &mdash; {date.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1 py-0.5">
              <button onClick={() => setDate(d => new Date(d.getTime() - 86400000))} className="text-gray-500 hover:text-[#4573A2] p-1 rounded"><ChevronLeftIcon className="w-4 h-4" /></button>
              <button onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setDate(d) }}
                className={`text-xs font-medium px-2 py-0.5 rounded ${isToday ? 'text-[#4573A2] bg-white shadow-sm' : 'text-gray-600 hover:bg-white'}`}>
                {isToday ? 'Heute' : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
              </button>
              <button onClick={() => setDate(d => new Date(d.getTime() + 86400000))} className="text-gray-500 hover:text-[#4573A2] p-1 rounded"><ChevronRightIcon className="w-4 h-4" /></button>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><XIcon className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Calendar Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-gray-300 border-t-[#4573A2] rounded-full animate-spin" /></div>
          ) : (
            <div className="relative" style={{ height: KAL_TOTAL_H }}>
              {/* Hour lines */}
              {Array.from({ length: KAL_HOUR_END - KAL_HOUR_START + 1 }, (_, i) => (
                <div key={i} className="absolute left-0 right-0 flex items-start" style={{ top: i * KAL_SLOT_H * 2 }}>
                  <span className="text-[10px] text-gray-400 font-medium w-12 text-right pr-2 -mt-1.5 select-none tabular-nums">{String(KAL_HOUR_START + i).padStart(2, '0')}:00</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>
              ))}
              {/* Half-hour dashed */}
              {Array.from({ length: KAL_HOUR_END - KAL_HOUR_START }, (_, i) => (
                <div key={`h-${i}`} className="absolute right-0" style={{ top: i * KAL_SLOT_H * 2 + KAL_SLOT_H, left: 48 }}>
                  <div className="border-t border-dashed border-gray-100 w-full" />
                </div>
              ))}
              {/* Free slot hover */}
              {Array.from({ length: KAL_TOTAL_SLOTS }, (_, i) => {
                const min = KAL_HOUR_START * 60 + i * 30
                const s = new Date(date); s.setHours(Math.floor(min / 60), min % 60, 0, 0)
                const e = new Date(s.getTime() + 120 * 60000)
                if (appointments.some(a => a.start < e && a.end > s)) return null
                return (
                  <div key={`fs-${i}`} className="absolute left-12 right-0 cursor-pointer hover:bg-green-50/60 transition-colors group"
                    style={{ top: i * KAL_SLOT_H, height: KAL_SLOT_H }} onClick={() => handleSlotClick(i)}>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center justify-center h-full">
                      <span className="text-[10px] text-green-600 font-medium flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded-full"><PlusIcon className="w-3 h-3" /> Termin buchen</span>
                    </div>
                  </div>
                )
              })}
              {/* Appointment blocks */}
              {appointments.map(appt => {
                const startMin = appt.start.getHours() * 60 + appt.start.getMinutes()
                const endMin = appt.end.getHours() * 60 + appt.end.getMinutes()
                const top = minuteToY(startMin)
                const height = Math.max(KAL_SLOT_H, minuteToY(endMin) - top)
                return (
                  <Link key={appt.id} href={appt.fallId ? `/admin/faelle/${appt.fallId}` : '#'}
                    className="absolute left-14 right-2 bg-[#4573A2]/10 border-l-[3px] border-[#4573A2] rounded-lg z-10 overflow-hidden hover:bg-[#4573A2]/15 hover:shadow-sm transition-all"
                    style={{ top, height }}>
                    <div className="px-3 py-1.5 h-full flex flex-col justify-center">
                      <div className="flex items-center gap-2">
                        <WrenchIcon className="w-3.5 h-3.5 text-[#4573A2] shrink-0" />
                        <span className="text-xs font-semibold text-[#4573A2] tabular-nums">
                          {String(appt.start.getHours()).padStart(2, '0')}:{String(appt.start.getMinutes()).padStart(2, '0')} &ndash; {String(appt.end.getHours()).padStart(2, '0')}:{String(appt.end.getMinutes()).padStart(2, '0')}
                        </span>
                      </div>
                      {height > 40 && <p className="text-[11px] text-gray-600 truncate mt-0.5 pl-[22px]">{appt.label}</p>}
                    </div>
                  </Link>
                )
              })}
              {/* Red time arrow */}
              {isToday && nowMinute >= KAL_HOUR_START * 60 && nowMinute <= KAL_HOUR_END * 60 && (
                <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: minuteToY(nowMinute) }}>
                  <div className="w-12 text-right pr-1"><span className="text-[9px] font-bold text-red-500 tabular-nums">{String(Math.floor(nowMinute / 60)).padStart(2, '0')}:{String(nowMinute % 60).padStart(2, '0')}</span></div>
                  <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[7px] border-l-red-500 -ml-0.5" />
                  <div className="flex-1 h-0.5 bg-red-500" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Booking Footer */}
        {bookingSlot !== null && (
          <div className="border-t border-gray-200 px-5 py-3 bg-green-50 flex-shrink-0">
            <p className="text-sm text-green-700 font-medium mb-2">
              Neuer Termin: {String(Math.floor(bookingSlot / 60)).padStart(2, '0')}:{String(bookingSlot % 60).padStart(2, '0')} Uhr &mdash; {date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} (2h)
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
    </div>
  )
}
