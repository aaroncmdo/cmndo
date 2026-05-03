// CMM-36: Mapbox Directions API — ETA von aktueller Position zur Zieladresse.
// Gibt Fahrtdauer in Minuten zurück, oder null bei Fehler.

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

export async function berechneEta(
  vonLat: number,
  vonLng: number,
  nachAdresse: string,
): Promise<{ etaMinuten: number; etaAnkunftzeit: Date } | null> {
  try {
    // Adresse geocoden
    const geoRes = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(nachAdresse)}.json?country=de&limit=1&access_token=${MAPBOX_TOKEN}`,
    )
    const geoData = await geoRes.json()
    const coords = geoData?.features?.[0]?.center
    if (!coords) return null
    const [zielLng, zielLat] = coords as [number, number]

    // Route berechnen
    const routeRes = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${vonLng},${vonLat};${zielLng},${zielLat}?overview=false&access_token=${MAPBOX_TOKEN}`,
    )
    const routeData = await routeRes.json()
    const dauerSek = routeData?.routes?.[0]?.duration
    if (!dauerSek) return null

    const etaMinuten = Math.ceil(dauerSek / 60)
    const etaAnkunftzeit = new Date(Date.now() + dauerSek * 1000)
    return { etaMinuten, etaAnkunftzeit }
  } catch {
    return null
  }
}
