'use client'

// AAR-809: Wetter-Banner als Shared-Component. Zieht 7-Tage-Forecast von
// open-meteo basierend auf Lat/Lng. Rendert nichts wenn keine Koordinaten
// oder Fetch-Fehler (graceful degradation — Banner ist Nice-to-Have, nicht
// Pflicht). Trailing-Actions-Slot für Outbox-Badge / Notifications-Glocke.
//
// Vorher: GutachterShell-Monolith (~80 LOC + 4 Helper-Functions). Wird
// jetzt rein als <WeatherBanner /> mit zwei Props eingehängt.

import { useEffect, useState, type ReactNode } from 'react'

type HourW = { hour: number; temp: number; code: number }
type DailyW = { date: string; tempMax: number; tempMin: number; code: number }
type WeatherData = {
  temp: number
  code: number
  hourly: Record<string, HourW[]>
  daily: DailyW[]
}

function wEmoji(c: number): string {
  return c === 0 ? '☀️' : c <= 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌦️' : '⛈️'
}
function wGrad(c: number): string {
  return c >= 61
    ? 'from-gray-700 to-gray-500'
    : c >= 45
      ? 'from-gray-500 to-gray-400'
      : c <= 3
        ? 'from-blue-500 to-sky-400'
        : 'from-gray-400 to-gray-300'
}
function wTip(c: number, t: number): string {
  return c >= 95
    ? 'Vorsicht, Gewitter!'
    : c >= 71
      ? 'Straßen können glatt sein!'
      : c >= 61
        ? 'Regenjacke einpacken!'
        : t > 30
          ? 'Wasser mitnehmen!'
          : t < 5
            ? 'Warm anziehen!'
            : 'Perfektes Gutachter-Wetter!'
}
function wLabel(c: number): string {
  return c === 0 ? 'Sonnig' : c <= 3 ? 'Bewölkt' : c <= 48 ? 'Nebel' : c <= 67 ? 'Regen' : c <= 77 ? 'Schnee' : c <= 82 ? 'Schauer' : 'Gewitter'
}

type Props = {
  standortLat: number | null
  standortLng: number | null
  /** Slot rechts im Banner (Mobile + Desktop) — z.B. OutboxBadge + UpdatesNav. */
  trailingSlot?: ReactNode
  /**
   * Optionales Greeting für Desktop (>= sm). Default „Gute Fahrt!".
   * Mobile zeigt das Greeting nicht (Platzgründe).
   */
  greeting?: string
}

export default function WeatherBanner({ standortLat, standortLng, trailingSlot, greeting = 'Gute Fahrt!' }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null)

  useEffect(() => {
    if (!standortLat || !standortLng) return
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${standortLat}&longitude=${standortLng}&current=temperature_2m,weathercode&hourly=temperature_2m,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe/Berlin&forecast_days=7`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (!d.current) return
        const hourlyByDate: Record<string, HourW[]> = {}
        for (let i = 0; i < (d.hourly?.time ?? []).length; i++) {
          const t = d.hourly.time[i]
          const dateKey = t.split('T')[0]
          const h: HourW = {
            hour: new Date(t).getHours(),
            temp: Math.round(d.hourly.temperature_2m[i]),
            code: d.hourly.weathercode[i],
          }
          if (!hourlyByDate[dateKey]) hourlyByDate[dateKey] = []
          hourlyByDate[dateKey].push(h)
        }
        const daily: DailyW[] = (d.daily?.time ?? []).map((t: string, i: number) => ({
          date: t,
          tempMax: Math.round(d.daily.temperature_2m_max[i]),
          tempMin: Math.round(d.daily.temperature_2m_min[i]),
          code: d.daily.weathercode[i],
        }))
        setWeather({
          temp: Math.round(d.current.temperature_2m),
          code: d.current.weathercode,
          hourly: hourlyByDate,
          daily,
        })
      })
      .catch(() => {
        /* graceful — Banner rendert null wenn Fetch fehlschlägt */
      })
  }, [standortLat, standortLng])

  if (!weather) return null

  const todayKey = new Date().toISOString().slice(0, 10)
  const todayHourly = weather.hourly?.[todayKey]?.filter((h) => h.hour >= 8 && h.hour <= 18) ?? []
  const tomorrowDaily = weather.daily?.[1] ?? null

  return (
    <div
      className={`flex-shrink-0 px-4 py-2.5 flex items-center gap-4 bg-gradient-to-r ${wGrad(weather.code)} text-white`}
      style={{ minHeight: 64 }}
    >
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-3xl">{wEmoji(weather.code)}</span>
        <div>
          <p className="text-xl font-bold">{weather.temp}°C</p>
          <p className="text-[10px] opacity-80">{wLabel(weather.code)}</p>
        </div>
      </div>
      <div className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0">
        {todayHourly
          .filter((_, i) => i % 2 === 0)
          .map((h) => (
            <div key={h.hour} className="text-center shrink-0 px-1">
              <p className="text-[9px] opacity-60">{String(h.hour).padStart(2, '0')}h</p>
              <p className="text-[10px]">{wEmoji(h.code)}</p>
              <p className="text-xs font-semibold">{h.temp}°</p>
            </div>
          ))}
      </div>
      {/* Mobile: nur Trailing-Slot */}
      {trailingSlot && (
        <div className="shrink-0 sm:hidden flex items-center gap-2">{trailingSlot}</div>
      )}
      {/* Desktop: Greeting + Tip + Tomorrow + Trailing */}
      <div className="shrink-0 text-right hidden sm:flex sm:items-center sm:gap-3">
        <div>
          <p className="text-sm font-medium">{greeting}</p>
          <p className="text-[10px] opacity-80">{wTip(weather.code, weather.temp)}</p>
          {tomorrowDaily && (
            <p className="text-[10px] opacity-70 mt-0.5">
              Morgen: {wEmoji(tomorrowDaily.code)} {tomorrowDaily.tempMax}°/{tomorrowDaily.tempMin}°{' '}
              {wLabel(tomorrowDaily.code)}
            </p>
          )}
        </div>
        {trailingSlot}
      </div>
    </div>
  )
}
