'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { terminBuchen } from '@/lib/actions/termin-actions'

type BelegterSlot = { start: string; end: string }

export default function KalenderClient({
  fallId,
  belegteSlots,
  arbeitszeiten,
}: {
  fallId: string
  belegteSlots: BelegterSlot[]
  arbeitszeiten: { start: number; end: number; tage: number[] }
}) {
  const router = useRouter()
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [confirmSlot, setConfirmSlot] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Naechste 14 Tage generieren
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days: Date[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push(d)
  }

  // Arbeitstage filtern
  const arbeitsTage = days.filter(d => arbeitszeiten.tage.includes(d.getDay() === 0 ? 7 : d.getDay()))

  // Slots fuer einen Tag generieren (90 Min Slots)
  function getSlotsForDay(day: Date): { time: string; belegt: boolean }[] {
    const slots: { time: string; belegt: boolean }[] = []
    for (let h = arbeitszeiten.start; h < arbeitszeiten.end; h++) {
      for (const m of [0, 30]) {
        if (h === arbeitszeiten.end - 1 && m === 30) continue // Letzter Slot muss 90min passen
        const slotStart = new Date(day)
        slotStart.setHours(h, m, 0, 0)
        const slotEnd = new Date(slotStart.getTime() + 90 * 60 * 1000)

        // Pruefen ob Slot in der Vergangenheit
        if (slotStart < new Date()) continue

        // Pruefen ob Slot mit belegten kollidiert
        const belegt = belegteSlots.some(b => {
          const bStart = new Date(b.start)
          const bEnd = new Date(b.end)
          return slotStart < bEnd && slotEnd > bStart
        })

        slots.push({
          time: slotStart.toISOString(),
          belegt,
        })
      }
    }
    return slots
  }

  async function handleBuchen() {
    if (!confirmSlot) return
    setLoading(true)
    const result = await terminBuchen({ slot: confirmSlot, source: 'kunde_kalender', fallId })
    setLoading(false)
    if (result.success) {
      setDone(true)
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
        <p className="text-lg font-semibold text-green-700 mb-2">Termin gebucht!</p>
        <p className="text-sm text-green-600 mb-4">
          {confirmSlot && new Date(confirmSlot).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
        <button onClick={() => router.push(`/kunde/faelle/${fallId}`)}
          className="px-4 py-2 bg-[#4573A2] text-white rounded-lg text-sm font-medium hover:bg-[#1E3A5F] transition-colors">
          Zurueck zum Fall
        </button>
      </div>
    )
  }

  const selectedSlots = selectedDay ? getSlotsForDay(selectedDay) : []

  return (
    <div className="space-y-4">
      {/* Tage-Auswahl */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-semibold">Tag waehlen</p>
        <div className="grid grid-cols-7 gap-1.5">
          {arbeitsTage.map(day => {
            const isSelected = selectedDay?.toDateString() === day.toDateString()
            const dayName = day.toLocaleDateString('de-DE', { weekday: 'short' })
            const dayNum = day.getDate()
            const monthName = day.toLocaleDateString('de-DE', { month: 'short' })
            return (
              <button key={day.toISOString()} onClick={() => { setSelectedDay(day); setConfirmSlot(null) }}
                className={`flex flex-col items-center py-2 px-1 rounded-lg text-xs transition-colors ${
                  isSelected
                    ? 'bg-[#4573A2] text-white'
                    : 'bg-gray-50 text-gray-700 hover:bg-[#4573A2]/10'
                }`}>
                <span className="font-medium">{dayName}</span>
                <span className="text-lg font-bold leading-tight">{dayNum}</span>
                <span className={`text-[10px] ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>{monthName}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Slots fuer gewaehlten Tag */}
      {selectedDay && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-semibold">
            Verfuegbare Zeiten — {selectedDay.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
          {selectedSlots.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Keine verfuegbaren Zeiten an diesem Tag.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {selectedSlots.map(slot => {
                const time = new Date(slot.time)
                const timeStr = time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                const isSelected = confirmSlot === slot.time
                return (
                  <button key={slot.time} disabled={slot.belegt}
                    onClick={() => setConfirmSlot(isSelected ? null : slot.time)}
                    className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      slot.belegt
                        ? 'bg-red-50 text-red-300 cursor-not-allowed'
                        : isSelected
                          ? 'bg-[#4573A2] text-white ring-2 ring-[#4573A2] ring-offset-1'
                          : 'bg-gray-50 text-gray-700 hover:bg-[#4573A2]/10'
                    }`}>
                    {slot.belegt ? (
                      <span className="line-through">{timeStr}</span>
                    ) : (
                      timeStr
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Bestaetigung */}
      {confirmSlot && (
        <div className="bg-[#4573A2]/5 border border-[#7BA3CC]/30 rounded-xl p-4">
          <p className="text-sm text-[#0D1B3E] mb-3">
            <strong>Gewaehlter Termin:</strong>{' '}
            {new Date(confirmSlot).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} Uhr
          </p>
          <button onClick={handleBuchen} disabled={loading}
            className="w-full py-3 rounded-xl bg-[#4573A2] text-white font-medium text-sm hover:bg-[#1E3A5F] transition-colors disabled:opacity-40">
            {loading ? 'Wird gebucht...' : 'Termin verbindlich buchen'}
          </button>
        </div>
      )}

      {/* Legende */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gray-50 border border-gray-200" />
          <span>Frei</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-50 border border-red-200" />
          <span>Belegt</span>
        </div>
      </div>
    </div>
  )
}
