// src/app/api/kfzgutachter-lp/gutachter-verfuegbar/_lib.ts
//
// Reine Helper für die Verfügbarkeits-API. Bewusst pure functions, damit
// sie unit-testbar sind (kein Fetch, kein DB-Client, kein Random). sample()
// nimmt einen rng-Param damit Tests deterministisch laufen.

export type GeoPolygon = {
  type: 'Polygon'
  coordinates: number[][][]
}

export function isClosedRing(ring: number[][]): boolean {
  if (ring.length < 4) return false
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1]
}

export function pointInRing(point: [number, number], ring: number[][]): boolean {
  if (!isClosedRing(ring)) return false
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function isValidPolygon(poly: unknown): poly is GeoPolygon {
  if (!poly || typeof poly !== 'object') return false
  const p = poly as { type?: unknown; coordinates?: unknown }
  if (p.type !== 'Polygon') return false
  if (!Array.isArray(p.coordinates) || p.coordinates.length === 0) return false
  const ring = p.coordinates[0]
  return Array.isArray(ring) && ring.length >= 4
}

export function extractStadt(adresse: string | null | undefined): string | null {
  if (!adresse) return null
  const match = adresse.match(/,\s*\d{5}\s+(.+?)$/)
  if (match?.[1]) return match[1].trim()
  const parts = adresse.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 0) return parts[parts.length - 1].replace(/^\d{5}\s+/, '')
  return null
}

export function firstInitial(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? `${trimmed.charAt(0).toUpperCase()}.` : null
}

export function isTestAccount(firmenname: string | null | undefined): boolean {
  if (!firmenname) return false
  return /\b(test|smoke|demo)\b/i.test(firmenname)
}

export function sample<T>(arr: T[], n: number, rng: () => number = Math.random): T[] {
  if (arr.length <= n) return arr.slice()
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

export function isValidPlaceId(raw: string): boolean {
  return /^[A-Za-z0-9_-]{10,128}$/.test(raw.trim())
}

export type GutachterProfilPublic = {
  id: string
  vorname_initiale: string | null
  stadt: string | null
  avatar_url: string | null
  bewertungs_durchschnitt: number | null
  bewertungs_anzahl: number | null
}
