/**
 * Der Quadtree ueber das Suchgebiet.
 *
 * Reine Rechenlogik, kein Netz — deshalb vollstaendig pruefbar, bevor ein
 * einziger Abruf Geld kostet.
 *
 * Das Verfahren: Das Gebiet wird in Kacheln zerlegt, je Kachel laeuft eine
 * Textsuche mit Mittelpunkt und Radius. Deckelt die Suche bei 60 Treffern, ist
 * die Kachel zu dicht und wird geviertelt (siehe `lauf.ts`).
 */

export type Kachel = {
  sued: number
  west: number
  nord: number
  ost: number
  /** Wie oft geviertelt wurde. Begrenzt die Verfeinerung. */
  tiefe: number
}

/** Grob die Aussengrenzen Deutschlands. */
export const DEUTSCHLAND: Kachel = {
  sued: 47.27, west: 5.87, nord: 55.06, ost: 15.04, tiefe: 0,
}

/**
 * ⚠ Google deckelt `radius` bei 50.000 m. Wir bleiben knapp darunter: eine
 * groessere Kachel wuerde stillschweigend beschnitten, und die Luecke fiele
 * niemandem auf — die fehlenden Bueros meldet sich ja nicht.
 */
export const MAX_RADIUS_KM = 49

const KM_JE_BREITENGRAD = 111.32

export function mittelpunkt(k: Kachel): { lat: number; lng: number } {
  return { lat: (k.sued + k.nord) / 2, lng: (k.west + k.ost) / 2 }
}

/**
 * Der Radius, der die Kachel vollstaendig abdeckt — die halbe DIAGONALE.
 *
 * ⚠ Nicht die halbe Kantenlaenge. Ein Kreis mit halber Kante laesst die vier
 * Ecken frei; genau dort saessen Bueros, die kein Lauf je findet. Der groessere
 * Kreis ueberlappt mit den Nachbarkacheln — das ist gewollt, die
 * Dublettenpruefung faengt es ab. Lieber doppelt als fehlend.
 *
 * ⚠ Ein Laengengrad ist in Flensburg rund 40 % kuerzer als am Aequator.
 * Deshalb `cos(lat)` fuer die Ost-West-Richtung: ohne das waeren die
 * noerdlichen Kacheln zu breit gerechnet und ihr Radius zu klein.
 */
export function radiusKm(k: Kachel): number {
  const hoeheKm = (k.nord - k.sued) * KM_JE_BREITENGRAD
  const mitte = mittelpunkt(k)
  const breiteKm = (k.ost - k.west) * KM_JE_BREITENGRAD * Math.cos((mitte.lat * Math.PI) / 180)
  return Math.sqrt(hoeheKm ** 2 + breiteKm ** 2) / 2
}

/** Vier gleiche Teile — Nordwest, Nordost, Suedwest, Suedost. */
export function vierteile(k: Kachel): Kachel[] {
  const mLat = (k.sued + k.nord) / 2
  const mLng = (k.west + k.ost) / 2
  const t = k.tiefe + 1
  return [
    { sued: mLat, west: k.west, nord: k.nord, ost: mLng, tiefe: t },
    { sued: mLat, west: mLng, nord: k.nord, ost: k.ost, tiefe: t },
    { sued: k.sued, west: k.west, nord: mLat, ost: mLng, tiefe: t },
    { sued: k.sued, west: mLng, nord: mLat, ost: k.ost, tiefe: t },
  ]
}

/**
 * Zerlegt ein Gebiet so weit, dass jede Kachel unter die Radiusgrenze passt.
 *
 * Die Tiefe bleibt bei 0: diese Teilung ist die Ausgangslage, nicht die
 * Verfeinerung. Erst was der Lauf wegen der 60-Treffer-Deckelung nachteilt,
 * zaehlt als Tiefe.
 */
export function startKacheln(gebiet: Kachel, maxRadiusKm: number): Kachel[] {
  const fertig: Kachel[] = []
  const offen: Kachel[] = [{ ...gebiet, tiefe: 0 }]

  // Sicherheitsnetz gegen eine Endlosteilung bei unsinnigen Eingaben.
  let runden = 0
  while (offen.length > 0 && runden < 10_000) {
    runden++
    const k = offen.pop()!
    if (radiusKm(k) <= maxRadiusKm) {
      fertig.push({ ...k, tiefe: 0 })
      continue
    }
    offen.push(...vierteile(k).map((t) => ({ ...t, tiefe: 0 })))
  }

  return fertig
}
