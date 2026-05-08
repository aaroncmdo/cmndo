// 2026-05-06: Server-side Weather-Fetch für Heute-Page-Stops.
//
// /api/weather/route.ts macht das via HTTP-Endpoint mit 5-min in-memory
// Cache. Für direkte Server-Calls (z. B. in page.tsx) brauchen wir
// dasselbe — aber ohne HTTP-Roundtrip.
//
// Cache via Module-Level-Map (lebt pro Lambda-Instanz). 5 min TTL wie
// im API-Endpoint.

const cache = new Map<string, { data: WeatherSnapshot; ts: number }>()
const TTL = 5 * 60 * 1000

export type WeatherSnapshot = {
  temp: number
  description: string
  icon: string
  weather_id: number
}

export async function getWeatherSnapshot(
  lat: number,
  lng: number,
): Promise<WeatherSnapshot | null> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY
  if (!apiKey) return null

  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < TTL) {
    return cached.data
  }

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&lang=de&appid=${apiKey}`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) return null
    const w = await res.json()
    const snap: WeatherSnapshot = {
      temp: Math.round(w.main?.temp ?? 0),
      description: w.weather?.[0]?.description ?? '',
      icon: w.weather?.[0]?.icon ?? '01d',
      weather_id: w.weather?.[0]?.id ?? 800,
    }
    cache.set(cacheKey, { data: snap, ts: Date.now() })
    return snap
  } catch {
    return null
  }
}

/** Mappt OpenWeatherMap weather_id auf passendes Emoji. */
export function weatherEmoji(id: number): string {
  if (id >= 200 && id < 300) return '⛈️'
  if (id >= 300 && id < 500) return '🌦️'
  if (id >= 500 && id < 600) return '🌧️'
  if (id >= 600 && id < 700) return '❄️'
  if (id >= 700 && id < 800) return '🌫️'
  if (id === 800) return '☀️'
  if (id > 800 && id <= 802) return '🌤️'
  if (id > 802) return '☁️'
  return '☀️'
}
