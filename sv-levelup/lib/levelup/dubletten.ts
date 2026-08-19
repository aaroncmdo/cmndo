import { kernName } from '../anreicherung/kern-name'

/** CONTEXT §5: gleicher Name innerhalb dieses Umkreises gilt als derselbe Betrieb. */
export const DUBLETTEN_KM = 10

/** Kuerzere Namenskerne tragen keinen Abgleich (siehe unten). */
const MIN_KERN = 4

const ERDRADIUS_KM = 6371

/** Luftlinie in Kilometern. */
export function entfernungKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const bogen = (g: number) => (g * Math.PI) / 180
  const dLat = bogen(lat2 - lat1)
  const dLng = bogen(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(bogen(lat1)) * Math.cos(bogen(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * ERDRADIUS_KM * Math.asin(Math.sqrt(a))
}

/**
 * Der Name, unter dem der Lead gefuehrt wird.
 *
 * F-06 Schritt 4: „name aus Firma oder Domain". `sv_leads.name` ist NOT NULL —
 * es MUSS ein Wert entstehen. Wenn weder Firma noch Domain bekannt sind, soll
 * der Wert die Unkenntnis ZEIGEN statt einen Namen zu erfinden (R-B): der
 * Vertrieb sieht dann sofort, dass hier nachzufragen ist.
 */
export function nameAusQuelle(
  firma: string | null,
  websiteUrl: string | null,
  ort: string | null,
): string {
  const f = firma?.trim()
  if (f) return f

  const host = websiteUrl?.trim()
    ?.replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
  if (host) return host

  return ort?.trim() ? `Unbenannt (${ort.trim()})` : 'Unbenannt'
}

export type Betriebsangabe = { firma: string | null; lat: number; lng: number }

/**
 * Sind das zwei Eintraege desselben Betriebs?
 *
 * ⚠ Verglichen wird der KERN (`kernName`), nicht `sv_leads.normalized_name`.
 * Die DB-Spalte ist GENERATED ALWAYS und macht nur `lower()` plus
 * Whitespace-Normalisierung — die Gattungswort-Entfernung, die CONTEXT §5
 * beschreibt, findet dort NICHT statt (geprueft 18.08.). Ein SQL-Vergleich
 * gegen sie traefe nie, und die Dublettenpruefung waere eine Attrappe: jeder
 * Check legte einen neuen Lead an.
 *
 * ⚠ Die Mindestlaenge ist Pflicht, nicht Feinschliff: `''.includes('')` ist
 * true. Zwei Betriebe, deren Namen nur aus Gattungswoertern bestehen
 * („Sachverständigenbüro" / „Kfz-Gutachter"), haetten beide einen leeren Kern
 * und gaelten als derselbe — der zweite bekaeme den Lead des ersten. Dieselbe
 * Falle ist im Projekt schon zweimal aufgetreten (kernStecktImHost, wett).
 */
export function istDublette(a: Betriebsangabe, b: Betriebsangabe): boolean {
  const kernA = kernName(a.firma ?? '').replace(/\s+/g, '')
  const kernB = kernName(b.firma ?? '').replace(/\s+/g, '')
  if (kernA.length < MIN_KERN || kernB.length < MIN_KERN) return false

  const passt = kernA === kernB || kernA.includes(kernB) || kernB.includes(kernA)
  if (!passt) return false

  return entfernungKm(a.lat, a.lng, b.lat, b.lng) <= DUBLETTEN_KM
}
