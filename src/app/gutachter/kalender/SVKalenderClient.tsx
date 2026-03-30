'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks,
  format, isSameDay, isToday, isBefore, startOfDay,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { setTermin } from './actions'

type Fall = {
  id: string
  fall_nummer: string | null
  sv_termin: string | null
  status: string
  schadens_ort: string | null
  schadens_adresse: string | null
  lead_id: string | null
}

export default function SVKalenderClient({
  faelle,
  leadMap,
}: {
  faelle: Fall[]
  leadMap: Record<string, string>
  svId: string
}) {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [dialogFall, setDialogFall] = useState<Fall | null>(null)
  const [terminDate, setTerminDate] = useState('')
  const [terminTime, setTerminTime] = useState('10:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    const end = endOfWeek(currentDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  const terminFaelle = faelle.filter(f => f.sv_termin)
  const ohneTermin = faelle.filter(f => !f.sv_termin)

  function getEntriesForDay(day: Date) {
    return terminFaelle.filter(f => isSameDay(new Date(f.sv_termin!), day))
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
    <div className="px-4 py-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-white">Kalender</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {format(weekDays[0], 'd. MMM', { locale: de })} – {format(weekDays[6], 'd. MMM yyyy', { locale: de })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">← Zurück</button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors font-medium">Heute</button>
            <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">Weiter →</button>
          </div>
        </div>

        {/* Week calendar grid */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden mb-6">
          <div className="grid grid-cols-7">
            {weekDays.map((day, i) => {
              const entries = getEntriesForDay(day)
              const today = isToday(day)
              return (
                <div key={i} className={`border-r border-zinc-800/50 last:border-r-0 min-h-48 ${today ? 'bg-zinc-800/30' : ''}`}>
                  {/* Day header */}
                  <div className="px-2 py-2 border-b border-zinc-800/50 text-center">
                    <span className="text-zinc-500 text-[10px] uppercase">{format(day, 'EEE', { locale: de })}</span>
                    <div className={`text-sm font-medium mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full ${
                      today ? 'bg-blue-600 text-white' : 'text-zinc-300'
                    }`}>
                      {format(day, 'd')}
                    </div>
                  </div>

                  {/* Entries */}
                  <div className="p-1.5 space-y-1">
                    {entries.map(fall => {
                      const time = fall.sv_termin ? format(new Date(fall.sv_termin), 'HH:mm') : ''
                      const overdue = fall.sv_termin && isBefore(new Date(fall.sv_termin), startOfDay(new Date()))
                      return (
                        <Link
                          key={fall.id}
                          href={`/gutachter/fall/${fall.id}`}
                          className={`block px-2 py-1.5 rounded-lg text-[10px] leading-tight transition-colors ${
                            overdue
                              ? 'bg-red-950/80 text-red-300 hover:bg-red-900/80'
                              : 'bg-blue-950/80 text-blue-300 hover:bg-blue-900/80'
                          }`}
                        >
                          <div className="font-medium">{time}</div>
                          <div className="truncate">{fall.fall_nummer ?? fall.id.slice(0, 8)}</div>
                          {fall.lead_id && (
                            <div className="truncate text-[9px] opacity-70">{leadMap[fall.lead_id] ?? ''}</div>
                          )}
                        </Link>
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
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Ohne Termin ({ohneTermin.length})
            </h2>
            <div className="space-y-2">
              {ohneTermin.map(fall => (
                <div key={fall.id} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl bg-zinc-800/40">
                  <div className="min-w-0">
                    <Link href={`/gutachter/fall/${fall.id}`} className="text-blue-400 hover:text-blue-300 text-xs font-mono">
                      {fall.fall_nummer ?? fall.id.slice(0, 8)}
                    </Link>
                    <p className="text-zinc-400 text-xs truncate">
                      {fall.lead_id ? leadMap[fall.lead_id] : '—'} · {fall.schadens_ort ?? '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => { setDialogFall(fall); setTerminDate(''); setTerminTime('10:00') }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                  >
                    Termin setzen
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Set termin dialog */}
        {dialogFall && (
          <>
            <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setDialogFall(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                <h2 className="text-white font-semibold mb-1">Termin setzen</h2>
                <p className="text-zinc-500 text-xs mb-4">
                  Fall {dialogFall.fall_nummer ?? dialogFall.id.slice(0, 8)}
                </p>

                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1">Datum</label>
                    <input
                      type="date"
                      value={terminDate}
                      onChange={e => setTerminDate(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs mb-1">Uhrzeit</label>
                    <input
                      type="time"
                      value={terminTime}
                      onChange={e => setTerminTime(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

                <div className="flex gap-2">
                  <button onClick={() => setDialogFall(null)} className="flex-1 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSetTermin}
                    disabled={saving || !terminDate}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40"
                  >
                    {saving ? 'Wird gesetzt...' : 'Speichern'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
