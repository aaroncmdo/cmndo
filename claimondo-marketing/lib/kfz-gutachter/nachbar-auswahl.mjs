// Die Auswahlregel fuer Nachbarorte — als reines JS, weil sie von ZWEI Welten
// gebraucht wird, die keinen gemeinsamen TypeScript-Pfad haben:
//   1. claimondo-marketing/lib/kfz-gutachter/nachbarstaedte.ts  (rendert die Seite)
//   2. scripts/build-stadt-stammdaten.mjs                       (Snapshot fuer src/)
// src/tsconfig mappt "@/*" nur auf ./src/*, ein Cross-Projekt-Import ist nicht
// moeglich; das Root-Script hat keinen TS-Loader. Waere die Regel dupliziert,
// zeigte die Stadtseite frueher oder spaeter andere Nachbarn als der KI-Prompt
// kennt. Deshalb liegt sie genau einmal hier, in einer Datei, die beide laden
// koennen. Die Typen kommen per JSDoc — nachbarstaedte.ts legt sie darueber.
//
// WARUM nicht einfach "die 6 naechsten": In der NRW-Dichte verdraengen Klein-
// staedte jede Grossstadt (Koeln bekaeme leverkusen/bergisch-gladbach/langenfeld/
// dormagen/troisdorf/bornheim — Bonn waere Rang 8, Duesseldorf Rang 16). In
// duenn besetzten Regionen ist reine Distanz dagegen genau richtig. Die Regel
// teilt die Plaetze deshalb: halb Nahbereich, halb naechste Grossstaedte.

const ERDRADIUS_KM = 6371

/** Jenseits dieser Distanz ist ein Ort kein "Nachbar" mehr, auch wenn sonst
 *  nichts naeher liegt. Bei den 92 Staedten von 08/2026 greift die Grenze nie
 *  (jede hat 6 Orte darunter) — sie ist die Reissleine fuer kleinere Orte in
 *  duenn besetzten Regionen, die spaeter dazukommen. */
export const NACHBAR_MAX_KM = 200

/** Ab dieser Einwohnerzahl zaehlt ein Ort als Grossstadt und bekommt einen der
 *  reservierten Plaetze. 200.000 trifft 40 der 92 Staedte. */
export const GROSSSTADT_AB_EINWOHNER = 200_000

/** @param {number} grad */
const bogenmass = (grad) => (grad * Math.PI) / 180

/**
 * Grosskreis-Distanz in Kilometern (Haversine). Ungerundet — gerundet wuerde
 * die Sortierung kuenstliche Gleichstaende erzeugen.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number}
 */
export function distanzKm(a, b) {
  const dLat = bogenmass(b.lat - a.lat)
  const dLng = bogenmass(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(bogenmass(a.lat)) * Math.cos(bogenmass(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * ERDRADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * `bevoelkerung` ist ein gepflegter Anzeigestring ("165 Tsd.", "3,7 Mio.").
 * Liefert 0 statt NaN, damit ein unbekanntes Format den Ort hoechstens von den
 * Grossstadt-Plaetzen ausschliesst, aber keine Sortierung vergiftet.
 * @param {string} bevoelkerung
 * @returns {number}
 */
export function einwohnerZahl(bevoelkerung) {
  const treffer = bevoelkerung.match(/^\s*([\d.,]+)\s*(Tsd|Mio)/)
  if (!treffer) return 0
  const zahl = Number.parseFloat(treffer[1].replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(zahl)) return 0
  return Math.round(zahl * (treffer[2] === 'Mio' ? 1_000_000 : 1_000))
}

/**
 * Die `limit` passendsten Nachbarorte, nach Distanz aufsteigend.
 * Unbekannter basisSlug -> leeres Array.
 * @template {{ slug: string, lat: number, lng: number, bevoelkerung: string }} T
 * @param {string} basisSlug
 * @param {readonly T[]} kandidaten
 * @param {number} [limit]
 * @returns {T[]}
 */
export function waehleNachbarn(basisSlug, kandidaten, limit = 6) {
  if (limit <= 0) return []
  const basis = kandidaten.find((k) => k.slug === basisSlug)
  if (!basis) return []

  // Tie-Break ueber den slug: ohne ihn entschiede die Array-Reihenfolge, und
  // damit wackelten Sitemap und Snapshot bei jeder Umsortierung von STAEDTE.
  const imUmkreis = kandidaten
    .filter((k) => k.slug !== basis.slug)
    .map((ort) => ({ ort, km: distanzKm(basis, ort) }))
    .filter((x) => x.km <= NACHBAR_MAX_KM)
    .sort((a, b) => a.km - b.km || a.ort.slug.localeCompare(b.ort.slug))

  const nahPlaetze = Math.ceil(limit / 2)
  const gewaehlt = imUmkreis.slice(0, nahPlaetze)
  const uebrig = imUmkreis.slice(nahPlaetze)

  for (const kandidat of uebrig) {
    if (gewaehlt.length >= limit) break
    if (einwohnerZahl(kandidat.ort.bevoelkerung) >= GROSSSTADT_AB_EINWOHNER) {
      gewaehlt.push(kandidat)
    }
  }

  // Reicht die Region nicht fuer die reservierten Grossstadt-Plaetze, fuellen
  // die naechsten uebrigen Orte auf — sonst haetten laendliche Orte Luecken.
  for (const kandidat of uebrig) {
    if (gewaehlt.length >= limit) break
    if (!gewaehlt.includes(kandidat)) gewaehlt.push(kandidat)
  }

  return gewaehlt
    .sort((a, b) => a.km - b.km || a.ort.slug.localeCompare(b.ort.slug))
    .map((x) => x.ort)
}
