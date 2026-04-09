// BUG-90: Zentrale Isochronen-Berechnung — extrahiert aus
// admin/sachverstaendige/[id]/actions.ts damit auch anlegeSv() und der
// Profil-Tab des Gutachters die gleiche Logik verwenden koennen.
//
// Strategie:
// 1) OSRM (project-osrm.org) gibt echte Fahr-Distanzen zurueck. Wir
//    bauen einen 60-Punkt-Stern um den Standort und skalieren jeden
//    Strahl so, dass die FAHR-Distanz dem gewuenschten Radius entspricht.
// 2) Wenn OSRM nicht antwortet (Timeout / Fehler), faellt die Funktion
//    auf einen seeded-pseudo-random Polygon zurueck (variabler Radius
//    ±15-30%, deterministisch pro Standort).
//
// Returns IMMER ein Polygon (Array von >=3 Punkten). Caller koennen
// also unbedingt schreiben — kein null-handling noetig.

const NUM_POINTS = 60
const OSRM_TIMEOUT_MS = 5000

export type IsoPoint = { lat: number; lng: number }

export async function calculateIsochrone(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<IsoPoint[]> {
  const rayPoints = buildRayPoints(lat, lng, radiusKm)

  // 1) OSRM-Distanzen versuchen
  try {
    const coords = [[lng, lat], ...rayPoints.map(p => [p.lng, p.lat])]
      .map(c => `${c[0].toFixed(5)},${c[1].toFixed(5)}`)
      .join(';')
    const res = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`,
      { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS) },
    )
    if (res.ok) {
      const data = await res.json()
      if (data.code === 'Ok' && data.distances?.[0]) {
        const driveDistances: number[] = data.distances[0]
          .slice(1)
          .map((d: number) => d / 1000)
        return rayPoints.map((p, i) => {
          const driveDist = driveDistances[i]
          if (!driveDist || driveDist <= 0) return { lat: p.lat, lng: p.lng }
          const dLat = p.lat - lat
          const dLng = p.lng - lng
          const airDist = Math.sqrt(
            (dLat * 111.32) ** 2 +
              (dLng * 111.32 * Math.cos((lat * Math.PI) / 180)) ** 2,
          )
          const scale = Math.max(
            0.4,
            Math.min(1.3, airDist > 0 ? radiusKm / driveDist : 1),
          )
          return { lat: lat + dLat * scale, lng: lng + dLng * scale }
        })
      }
    }
  } catch {
    // OSRM nicht erreichbar - silent fallback.
  }

  // 2) Fallback: seeded variabler Radius
  return fallbackPolygon(lat, lng, radiusKm)
}

function buildRayPoints(lat: number, lng: number, radiusKm: number) {
  const rayPoints: { lat: number; lng: number; angle: number }[] = []
  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (2 * Math.PI * i) / NUM_POINTS
    const dLat = (radiusKm / 111.32) * Math.cos(angle)
    const dLng =
      (radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle)
    rayPoints.push({ lat: lat + dLat, lng: lng + dLng, angle })
  }
  return rayPoints
}

function fallbackPolygon(lat: number, lng: number, radiusKm: number): IsoPoint[] {
  function seededRandom(seed: number) {
    const x = Math.sin(seed * 9301 + 49297) * 49297
    return x - Math.floor(x)
  }
  const baseSeed =
    Math.round(lat * 1000) * 100000 + Math.round(lng * 1000) * 100 + radiusKm
  return Array.from({ length: NUM_POINTS }, (_, i) => {
    const angle = (2 * Math.PI * i) / NUM_POINTS
    const variation = 0.15 + seededRandom(baseSeed + i * 7) * 0.2
    const factor =
      1 - variation + seededRandom(baseSeed + i * 13) * variation * 2
    const dLat = ((radiusKm * factor) / 111.32) * Math.cos(angle)
    const dLng =
      ((radiusKm * factor) / (111.32 * Math.cos((lat * Math.PI) / 180))) *
      Math.sin(angle)
    return { lat: lat + dLat, lng: lng + dLng }
  })
}
