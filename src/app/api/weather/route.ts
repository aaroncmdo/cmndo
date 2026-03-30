import { NextResponse } from 'next/server'

// ─── In-memory cache (5 min TTL) ────────────────────────────────────────────
const cache = new Map<string, { data: unknown; ts: number }>()
const TTL = 5 * 60 * 1000

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const apiKey = process.env.OPENWEATHERMAP_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'no_api_key' }, { status: 503 })
  }

  // Round coords to 2 decimals for cache key stability
  const cacheKey = `${parseFloat(lat).toFixed(2)},${parseFloat(lng).toFixed(2)}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data)
  }

  try {
    // Fetch current weather + 3h forecast in parallel
    const [weatherRes, forecastRes] = await Promise.all([
      fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&lang=de&appid=${apiKey}`,
      ),
      fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&lang=de&cnt=4&appid=${apiKey}`,
      ),
    ])

    if (!weatherRes.ok) {
      return NextResponse.json({ error: 'weather_api_error' }, { status: 502 })
    }

    const weather = await weatherRes.json()
    const forecast = forecastRes.ok ? await forecastRes.json() : null

    const result = {
      city: weather.name,
      temp: Math.round(weather.main.temp),
      feels_like: Math.round(weather.main.feels_like),
      description: weather.weather[0]?.description ?? '',
      icon: weather.weather[0]?.icon ?? '01d',
      wind: Math.round((weather.wind?.speed ?? 0) * 3.6), // m/s → km/h
      humidity: weather.main.humidity,
      weather_id: weather.weather[0]?.id ?? 800,
      forecast: forecast?.list?.slice(1, 4).map((f: Record<string, unknown>) => ({
        time: (f as { dt: number }).dt,
        temp: Math.round(((f as { main: { temp: number } }).main).temp),
        icon: ((f as { weather: { icon: string }[] }).weather)[0]?.icon ?? '01d',
      })) ?? [],
    }

    cache.set(cacheKey, { data: result, ts: Date.now() })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 })
  }
}
