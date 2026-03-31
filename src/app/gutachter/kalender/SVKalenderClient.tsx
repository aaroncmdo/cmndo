'use client'

import { useState, useMemo, useEffect } from 'react'
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

type DailyW = { date: string; tempMax: number; tempMin: number; code: number }
function wEmoji(c: number) { return c === 0 ? '☀️' : c <= 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌦️' : '⛈️' }

export default function SVKalenderClient({
  faelle,
  leadMap,
  gcalConnected,
  standortLat,
  standortLng,
}: {
  faelle: Fall[]
  leadMap: Record<string, string>
  svId: string
  gcalConnected: boolean
  standortLat?: number | null
  standortLng?: number | null
}) {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [dialogFall, setDialogFall] = useState<Fall | null>(null)
  const [terminDate, setTerminDate] = useState('')
  const [terminTime, setTerminTime] = useState('10:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dailyWeather, setDailyWeather] = useState<Record<string, DailyW>>({})

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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sticky Topbar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Kalender</h1>
          <p className="text-gray-500 text-xs">
            {format(weekDays[0], 'd. MMM', { locale: de })} – {format(weekDays[6], 'd. MMM yyyy', { locale: de })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {gcalConnected ? (
            <span className="text-[10px] bg-green-50 text-green-600 px-2 py-1 rounded-full font-medium">Google Calendar verbunden</span>
          ) : (
            <a href="/api/auth/google-calendar/connect"
              className="flex items-center gap-2 bg-white border border-gray-300 hover:shadow-md text-sm font-medium px-3 py-1.5 rounded-lg transition-shadow">
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Google Calendar verbinden
            </a>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">← Zurück</button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs text-gray-700 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors font-medium">Heute</button>
            <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">Weiter →</button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {/* Week calendar grid */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="grid grid-cols-7">
            {weekDays.map((day, i) => {
              const entries = getEntriesForDay(day)
              const today = isToday(day)
              const dayKey = format(day, 'yyyy-MM-dd')
              const dayW = dailyWeather[dayKey]
              return (
                <div key={i} className={`border-r border-gray-200/50 last:border-r-0 min-h-48 ${today ? 'bg-gray-100/30' : ''}`}>
                  {/* Day header */}
                  <div className="px-2 py-2 border-b border-gray-200/50 text-center">
                    <span className="text-gray-500 text-[10px] uppercase">{format(day, 'EEE', { locale: de })}</span>
                    <div className={`text-sm font-medium mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full ${
                      today ? 'bg-blue-600 text-white' : 'text-gray-700'
                    }`}>
                      {format(day, 'd')}
                    </div>
                    {dayW && (
                      <div className="mt-0.5">
                        <span className="text-xs">{wEmoji(dayW.code)}</span>
                        <span className="text-[9px] text-gray-500 ml-0.5">{dayW.tempMax}°</span>
                      </div>
                    )}
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
                              ? 'bg-red-50/80 text-red-300 hover:bg-red-900/80'
                              : 'bg-blue-50/80 text-blue-300 hover:bg-blue-900/80'
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
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Ohne Termin ({ohneTermin.length})
            </h2>
            <div className="space-y-2">
              {ohneTermin.map(fall => (
                <div key={fall.id} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl bg-gray-100/40">
                  <div className="min-w-0">
                    <Link href={`/gutachter/fall/${fall.id}`} className="text-blue-400 hover:text-blue-300 text-xs font-mono">
                      {fall.fall_nummer ?? fall.id.slice(0, 8)}
                    </Link>
                    <p className="text-gray-500 text-xs truncate">
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
              <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                <h2 className="text-gray-900 font-semibold mb-1">Termin setzen</h2>
                <p className="text-gray-500 text-xs mb-4">
                  Fall {dialogFall.fall_nummer ?? dialogFall.id.slice(0, 8)}
                </p>

                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-gray-500 text-xs mb-1">Datum</label>
                    <input
                      type="date"
                      value={terminDate}
                      onChange={e => setTerminDate(e.target.value)}
                      className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-500 text-xs mb-1">Uhrzeit</label>
                    <input
                      type="time"
                      value={terminTime}
                      onChange={e => setTerminTime(e.target.value)}
                      className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

                <div className="flex gap-2">
                  <button onClick={() => setDialogFall(null)} className="flex-1 py-2.5 rounded-xl text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
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
