// KFZ-179: ETA-Berechnung via Google Directions API (Server-seitig).

export async function calculateEtaMinutes(
  origin: { lat: number; lng: number },
  destinationAddress: string,
): Promise<number> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  if (!apiKey) return 30

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json')
    url.searchParams.set('origin', `${origin.lat},${origin.lng}`)
    url.searchParams.set('destination', destinationAddress)
    url.searchParams.set('mode', 'driving')
    url.searchParams.set('language', 'de')
    url.searchParams.set('key', apiKey)

    const res = await fetch(url.toString())
    const data = await res.json()

    if (data.status !== 'OK' || !data.routes?.[0]?.legs?.[0]?.duration) return 30

    return Math.round(data.routes[0].legs[0].duration.value / 60)
  } catch {
    return 30
  }
}
