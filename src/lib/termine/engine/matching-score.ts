// P2.4 — Pure SV-Ranking-Logik der Termin-Engine (portiert aus lib/dispatch/findBestSV).
// KEINE I/O. Score-Formel, Tenure-Tie-Break, Gebiet-Geometrie, Slot-Auswahl — rein,
// testbar, an EINER Stelle tunebar. Business (Aaron 02.06.):
//   - "Pakete voll bekommen": paketPrio (höheres Paket zuerst) + Rest-Kapazität (-genutzt).
//   - "Wer zuerst eingetreten hat im Zweifelsfall Vorrang": Tenure-Tie-Break bei ~gleichem Score.
import type { TagVerfuegbarkeit } from './types'

export const PAKET_PRIO: Record<string, number> = {
  premium: 3, 'premium-50': 3,
  pro: 2, 'standard-25': 2,
  standard: 1, 'starter-10': 1,
  basic: 0,
}

// Score-Gewichte (höher = besser). Mirror der findBestSV-Formel; hier die eine Quelle.
export const W_PAKET = 100
// 13b LOCKED: das Netzwerkpartner-Abo loest paketPrio als Ranking-Primaertreiber ab
// (paket = Legacy-Fulfillment, kein Ranking). Binaerer Bucket: zahlender Netzwerkpartner (100)
// ueber Free (0). Gleiche Groesse wie W_PAKET, damit die Score-Skala stabil bleibt.
export const W_NETZWERK = 100
export const W_KONTINGENT_GENUTZT = 2
export const W_ABLEHNUNG = 2
export const W_ETA_MIN = 0.5
// C-Reihung (Aaron 08.07.): Rang-Fein-Sort INNERHALB der Paket-Stufe. 2*W_RANG < W_PAKET
// (20 < 100) => der Rang ueberschreitet NIE eine Paket-Stufe — die Paket-Prioritaet (Revenue)
// bleibt primaer, der verdiente Rang verfeinert nur die Reihung innerhalb derselben Stufe.
// Flag-gated im Caller (rangOrdinal nur gesetzt, wenn das Matching-Flag an ist). Tunbar.
export const W_RANG = 10
// "Zweifelsfall"-Granularität: Kandidaten im selben Score-Bucket gelten als gleich gut
// → Tenure entscheidet. 5 ≈ 10 ETA-Minuten Unterschied. Tunebar.
export const SCORE_BUCKET = 5

/** Basic-SVs (paket='basic') haben kein Fall-Kontingent — rein kalenderbasiert, nie blockiert. */
export function istKontingentBlockiert(paket: string, kontingentFrei: number): boolean {
  if (paket === 'basic') return false
  return kontingentFrei <= 0
}

export interface SvKandidatFeatures {
  /** 13b: zahlender Netzwerkpartner (aktives/comped Abo) > Free. Loest paketPrio ab (K3:
   *  paket bleibt Legacy-Fulfillment, NICHT im Score). Vom Caller batch-vorgeladen (K10). */
  istNetzwerkpartner: boolean
  kontingentGenutzt: number
  ablehnungen30d: number
  /** echte Mapbox-ETA Büro→Schadenort in Minuten; null → Haversine-km als Fallback-Penalty. */
  etaVomBueroMin: number | null
  distanzKm: number
  /** 0=bronze/kein Rang, 1=silber, 2=gold. Rang-Fein-Sort INNERHALB der Paket-Stufe
   *  (nur gesetzt, wenn das Matching-Flag an ist; sonst undefined → kein Effekt). */
  rangOrdinal?: number
}

/** Reiner SV-Score (höher = besser). 13b: zahlender Netzwerkpartner > Free (W_NETZWERK); rangOrdinal verfeinert innerhalb. */
export function bewerteSvKandidat(f: SvKandidatFeatures): number {
  const distanzPenalty = f.etaVomBueroMin != null ? f.etaVomBueroMin * W_ETA_MIN : f.distanzKm
  return (f.istNetzwerkpartner ? 1 : 0) * W_NETZWERK
    + (f.rangOrdinal ?? 0) * W_RANG
    - f.kontingentGenutzt * W_KONTINGENT_GENUTZT
    - f.ablehnungen30d * W_ABLEHNUNG
    - distanzPenalty
}

/** Rang → Ordinal für die Fein-Sort: bronze/kein Rang = 0, silber = 1, gold = 2. */
export function rangToOrdinal(rang: string | null | undefined): number {
  return rang === 'gold' ? 2 : rang === 'silber' ? 1 : 0
}

export interface TenureInfo {
  partnerSeit: string | null
  createdAt: string | null
  id: string
}

/**
 * Tenure-Tie-Break (Aaron: "wer zuerst eingetreten ist hat im Zweifelsfall Vorrang").
 * < 0 = a vor b. Frühestes partner_seit zuerst → dann created_at → dann id (deterministisch).
 * Unbekannte Tenure (null) landet hinten.
 */
export function vergleicheTenure(a: TenureInfo, b: TenureInfo): number {
  const pa = a.partnerSeit ?? a.createdAt
  const pb = b.partnerSeit ?? b.createdAt
  if (pa && pb) { if (pa !== pb) return pa < pb ? -1 : 1 }
  else if (pa) return -1
  else if (pb) return 1
  const ca = a.createdAt, cb = b.createdAt
  if (ca && cb) { if (ca !== cb) return ca < cb ? -1 : 1 }
  else if (ca) return -1
  else if (cb) return 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export interface RankbarerKandidat extends TenureInfo {
  score: number
}

/**
 * Sortiert absteigend nach Score-Bucket; bei gleichem Bucket ("Zweifelsfall") entscheidet
 * Tenure. Proper total order (transitiv über Bucket-Quantisierung) → deterministisch.
 */
export function sortiereKandidaten<T extends RankbarerKandidat>(kandidaten: T[]): T[] {
  const bucket = (s: number) => Math.round(s / SCORE_BUCKET)
  return [...kandidaten].sort((a, b) => {
    const ba = bucket(a.score), bb = bucket(b.score)
    if (ba !== bb) return bb - ba
    return vergleicheTenure(a, b)
  })
}

/** Haversine-Distanz in km (mirror findBestSV; Engine-eigen für Gebiet-Check + Fallback-Penalty). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Point-in-Polygon (ray-casting). polygon = [lng,lat][] (parseIsochrone-Format). */
export function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Frühester freier Slot aus freieSlots-Ergebnis (Wall-Clock-Teile, TZ-stabil). null = keiner.
 * `notBefore` (Wall-Clock {datum,uhrzeit}, z.B. "jetzt") überspringt vergangene Slots — freieSlots
 * liefert für HEUTE auch Slots VOR der aktuellen Uhrzeit (gesamtes Arbeitszeitfenster), die nicht
 * gebucht werden dürfen. Vergleich rein lexikografisch (zero-padded Format) → pure + TZ-stabil.
 */
export function ersterFreierSlot(
  tage: TagVerfuegbarkeit[],
  notBefore?: { datum: string; uhrzeit: string } | null,
): { datum: string; uhrzeit: string; dauerMin: number } | null {
  for (const t of tage) {
    if (notBefore && t.datum < notBefore.datum) continue
    for (const s of t.slots) {
      if (notBefore && t.datum === notBefore.datum && s.uhrzeit < notBefore.uhrzeit) continue
      return { datum: t.datum, uhrzeit: s.uhrzeit, dauerMin: s.dauer }
    }
  }
  return null
}
