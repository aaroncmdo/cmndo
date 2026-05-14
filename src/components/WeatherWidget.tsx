'use client'

import { useEffect, useState } from 'react'

type WeatherData = {
  city: string
  temp: number
  feels_like: number
  description: string
  icon: string
  wind: number
  humidity: number
  weather_id: number
  forecast: { time: number; temp: number; icon: string }[]
}

// ─── Weather condition → driving hint ────────────────────────────────────────
function getDrivingHint(id: number): { text: string; color: string } {
  if (id >= 200 && id < 300)
    return { text: 'Achtung: Gewitter erwartet. Planen Sie mehr Zeit ein.', color: 'text-red-500' }
  if (id >= 300 && id < 400)
    return { text: 'Leichter Nieselregen. Vorsicht auf nassen Straßen.', color: 'text-amber-400' }
  if (id >= 500 && id < 505)
    return { text: 'Vorsicht auf nassen Straßen. Denken Sie an eine Jacke!', color: 'text-amber-400' }
  if (id >= 505 && id < 600)
    return { text: 'Achtung: Starker Regen erwartet. Planen Sie mehr Zeit ein.', color: 'text-red-500' }
  if (id >= 600 && id < 700)
    return { text: 'Winterliche Straßenbedingungen. Fahren Sie vorsichtig!', color: 'text-red-500' }
  if (id >= 700 && id < 800)
    return { text: 'Eingeschränkte Sicht. Fahren Sie mit Abblendlicht.', color: 'text-amber-400' }
  if (id === 800)
    return { text: 'Beste Bedingungen für Ihre Tour heute!', color: 'text-emerald-400' }
  if (id > 800 && id <= 802)
    return { text: 'Gute Sicht, angenehme Fahrt.', color: 'text-emerald-400' }
  return { text: 'Gute Sicht, angenehme Fahrt.', color: 'text-emerald-400' }
}

function formatForecastTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
}

export default function WeatherWidget({ lat, lng }: { lat: number | null; lng: number | null }) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!lat || !lng) return
    fetch(`/api/weather?lat=${lat}&lng=${lng}`)
      .then(r => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(setWeather)
      .catch(() => setError(true))
  }, [lat, lng])

  if (!lat || !lng) return null
  if (error) {
    return (
      <div className="bg-white/60 border border-claimondo-border rounded-2xl p-4 max-w-[300px]">
        <p className="text-claimondo-ondo text-xs">Wetter konnte nicht geladen werden.</p>
      </div>
    )
  }
  if (!weather) {
    return (
      <div className="bg-white/60 border border-claimondo-border rounded-2xl p-5 max-w-[300px] animate-pulse">
        <div className="h-4 w-20 bg-claimondo-bg rounded mb-3" />
        <div className="h-8 w-16 bg-claimondo-bg rounded mb-2" />
        <div className="h-3 w-32 bg-claimondo-bg rounded" />
      </div>
    )
  }

  const hint = getDrivingHint(weather.weather_id)

  return (
    <div className="bg-white/60 backdrop-blur-md border border-claimondo-border/50 rounded-2xl p-5 max-w-[300px] w-full">
      {/* City */}
      <p className="text-claimondo-ondo text-xs font-medium uppercase tracking-wide mb-2">{weather.city}</p>

      {/* Temp + Icon row */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[32px] font-bold text-claimondo-navy leading-none tabular-nums">{weather.temp}°</span>
        <img
          src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
          alt={weather.description}
          width={48}
          height={48}
          className="w-12 h-12 -my-1"
        />
      </div>

      {/* Description */}
      <p className="text-claimondo-navy text-sm capitalize mb-3">{weather.description}</p>

      {/* Details row */}
      <div className="flex items-center gap-4 text-xs text-claimondo-ondo mb-3">
        <span>Gefühlt {weather.feels_like}°</span>
        <span>Wind {weather.wind} km/h</span>
        <span>{weather.humidity}%</span>
      </div>

      {/* Driving hint */}
      <p className={`text-xs font-medium ${hint.color} mb-3`}>{hint.text}</p>

      {/* 3h forecast */}
      {weather.forecast.length > 0 && (
        <div className="flex items-center gap-3 pt-3 border-t border-claimondo-border">
          {weather.forecast.map((f, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
              <span className="text-claimondo-ondo text-[10px]">{formatForecastTime(f.time)}</span>
              <img
                src={`https://openweathermap.org/img/wn/${f.icon}.png`}
                alt=""
                width={28}
                height={28}
                className="w-7 h-7"
              />
              <span className="text-claimondo-navy text-xs font-medium tabular-nums">{f.temp}°</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
