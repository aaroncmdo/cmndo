/**
 * Task 11 — Reiner Entscheidungs-Helper fuer den Werkstatt-Geo-Fallback.
 *
 * Entscheidet, ob ein werkstatt-Lead (kein Besichtigungsort-Coords) die Geo
 * der zugeordneten Werkstatt als Resume-Safety-Net erhalten soll.
 *
 * Kein I/O, kein State — nur reine Funktion (unit-testbar ohne Mocks).
 * Analog zur Geocode-Fallback-Logik (#3064) in ladeMatchingFlow, aber als
 * extrahierter Helper, damit der Entscheidungspfad isoliert testbar ist.
 */

export type WerkstattGeoRow = {
  lat: number | null
  lng: number | null
  adresse_strasse: string | null
  adresse_plz: string | null
  adresse_ort: string | null
}

export type WerkstattFallbackResult = {
  lat: number
  lng: number
  adresse: string
}

/**
 * Gibt Werkstatt-Coords als Besichtigungsort-Fallback zurueck — oder null wenn
 * der Fallback nicht greift.
 *
 * Greift genau dann wenn:
 *   - currentLat ODER currentLng null ist (kein vollstaendiger Besichtigungsort)
 *   - UND ein werkstattRow uebergeben wird (werkstatt_id gesetzt)
 *   - UND die Werkstatt selbst lat+lng hat
 *
 * Gibt null zurueck wenn:
 *   - currentLat UND currentLng bereits gesetzt (kein Override-Bedarf)
 *   - ODER werkstattRow ist null (kein Werkstatt-Bezug)
 *   - ODER werkstattRow hat keine Coords
 */
export function resolveWerkstattFallbackGeo(
  currentLat: number | null,
  currentLng: number | null,
  werkstattRow: WerkstattGeoRow | null,
): WerkstattFallbackResult | null {
  // Wenn Lead bereits vollstaendige Coords hat, kein Fallback noetig.
  if (currentLat != null && currentLng != null) return null

  // Kein Werkstatt-Row -> kann nicht helfen.
  if (!werkstattRow) return null

  // Werkstatt hat keine Coords -> kann nicht helfen.
  if (werkstattRow.lat == null || werkstattRow.lng == null) return null

  // Adresse best-effort aus den Adressfeldern zusammensetzen.
  const parts: string[] = []
  if (werkstattRow.adresse_strasse) parts.push(werkstattRow.adresse_strasse)
  const ortParts: string[] = []
  if (werkstattRow.adresse_plz) ortParts.push(werkstattRow.adresse_plz)
  if (werkstattRow.adresse_ort) ortParts.push(werkstattRow.adresse_ort)
  if (ortParts.length > 0) parts.push(ortParts.join(' '))

  return {
    lat: werkstattRow.lat,
    lng: werkstattRow.lng,
    adresse: parts.join(', '),
  }
}
