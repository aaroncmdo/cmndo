// Pure Logik der Unfallatlas-Auswertung — ohne Netz, ohne Dateisystem, damit
// die beiden teuren Fallen testbar sind (s.u.).

/** Unfaelle mit Personenschaden je ~100-m-Zelle ueber den gesamten Zeitraum. */
export const SCHWELLE = 10
/** Hotspots je Stadt. Drei reichen fuer einen Absatz und halten die
 *  Geocoding-Kosten bei ~450 statt ~5.700 Aufrufen. */
export const PRO_STADT = 3
/** Mindestabstand zwischen zwei Hotspots derselben Stadt (~250 m). Ohne das
 *  beschreiben zwei Cluster dieselbe Kreuzung mit zwei Strassennamen. */
const MIN_ABSTAND_LAT = 0.0025
const MIN_ABSTAND_LNG = 0.0037

const SPALTEN = ['ULAND', 'UREGBEZ', 'UKREIS', 'UGEMEINDE', 'XGCSWGS84', 'YGCSWGS84', 'UKATEGORIE']

/**
 * Loest die Spaltenindizes ueber die Kopfzeile auf.
 *
 * ⚠ DIE ERSTE FALLE: die Layouts unterscheiden sich je Jahrgang — 2021 liegt
 * XGCSWGS84 auf 21, 2022–2024 auf 23, 2025 auf 22 (OID_/OBJECTID/PLST kommen
 * und gehen). Ein fester Index liest in drei Jahrgaengen LINREFX: plausible
 * Zahlen, die woanders hinzeigen. Fehlt eine Spalte, wird geworfen — eine
 * stille 0 waere die teurere Antwort.
 */
export function spaltenIndizes(kopfzeile) {
  const kopf = kopfzeile.replace(/^﻿/, '').split(';').map((c) => c.trim().toUpperCase())
  const idx = {}
  for (const n of SPALTEN) {
    const i = kopf.indexOf(n)
    if (i < 0) throw new Error(`Spalte ${n} fehlt (Kopfzeile: ${kopf.join(',')})`)
    idx[n] = i
  }
  idx._anzahl = kopf.length
  return idx
}

/**
 * Baut den amtlichen Gemeindeschluessel aus den vier Teilfeldern.
 *
 * ⚠ DIE ZWEITE FALLE: der AGS ist **8-stellig** (2+1+2+3), nicht 9. Mit einer
 * Null zuviel trifft der Abgleich nichts — und das sieht aus wie „diese Stadt
 * hat keine Unfaelle", nicht wie ein Fehler.
 */
export function bildeAgs(uland, uregbez, ukreis, ugemeinde) {
  return (
    String(uland).trim().padStart(2, '0') +
    String(uregbez).trim().padStart(1, '0') +
    String(ukreis).trim().padStart(2, '0') +
    String(ugemeinde).trim().padStart(3, '0')
  )
}

/**
 * Baut den Nachschlage-Index Stadt-AGS -> Slug.
 *
 * ⚠ DIE DRITTE FALLE — Stadtstaaten: Berlin und Hamburg fuehren wir unter dem
 * Gesamtstadt-Schluessel (11000000 / 02000000), der Unfallatlas schluesselt sie
 * aber nach BEZIRKEN auf (Berlin 11001001…11012012, Hamburg ~180 Teilschluessel).
 * Ein exakter Abgleich trifft dort NICHTS — und das Ergebnis waere gewesen, dass
 * ausgerechnet die zwei groessten Staedte leer bleiben, ohne dass irgendetwas
 * rot wird.
 *
 * Bremen faellt NICHT darunter: es hat mit 04011000 einen echten Gemeinde-
 * schluessel, so wie ihn auch der Unfallatlas fuehrt.
 */
export function baueAgsIndex(agsZuSlug) {
  const exakt = new Map()
  const bundesland = new Map()
  for (const [ags, slug] of agsZuSlug) {
    if (/^\d{2}000000$/.test(ags)) bundesland.set(ags.slice(0, 2), slug)
    else exakt.set(ags, slug)
  }
  return { exakt, bundesland }
}

/** Exakt zuerst, dann der Stadtstaat-Fall. */
export function findeSlug(index, ags) {
  return index.exakt.get(ags) ?? index.bundesland.get(ags.slice(0, 2)) ?? null
}

/**
 * Liest einen Jahrgang und aggregiert in `proStadt` (Map slug -> Map zelle -> zaehler).
 * @param agsZuSlug Map AGS -> Slug (wird intern indiziert) ODER ein fertiger Index
 * @returns Anzahl beruecksichtigter Unfaelle
 */
export function clusterAusZeilen(text, agsZuSlug, proStadt) {
  const index = agsZuSlug instanceof Map ? baueAgsIndex(agsZuSlug) : agsZuSlug
  const zeilen = text.split(/\r?\n/)
  const I = spaltenIndizes(zeilen[0])
  let n = 0
  for (let z = 1; z < zeilen.length; z++) {
    const s = zeilen[z].split(';')
    if (s.length < I._anzahl - 1) continue
    const slug = findeSlug(index, bildeAgs(s[I.ULAND], s[I.UREGBEZ], s[I.UKREIS], s[I.UGEMEINDE]))
    if (!slug) continue
    // Deutsche Dezimalkommata.
    const lng = parseFloat(String(s[I.XGCSWGS84]).replace(',', '.'))
    const lat = parseFloat(String(s[I.YGCSWGS84]).replace(',', '.'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const zelle = `${Math.round(lat / 0.001)}_${Math.round(lng / 0.0015)}` // ~100 m
    if (!proStadt.has(slug)) proStadt.set(slug, new Map())
    const m = proStadt.get(slug)
    if (!m.has(zelle)) m.set(zelle, { n: 0, schwer: 0, tote: 0, latSum: 0, lngSum: 0 })
    const c = m.get(zelle)
    c.n++
    c.latSum += lat
    c.lngSum += lng
    const kat = parseInt(s[I.UKATEGORIE], 10)
    if (kat === 1) c.tote++
    else if (kat === 2) c.schwer++
    n++
  }
  return n
}

/** Waehlt je Stadt die staerksten Haeufungen mit Mindestabstand. */
export function waehleProStadt(proStadt, schwelle = SCHWELLE, proStadtMax = PRO_STADT) {
  const ergebnis = []
  for (const [slug, zellen] of proStadt) {
    const kandidaten = [...zellen.values()]
      .filter((c) => c.n >= schwelle)
      .map((c) => ({ slug, ...c, lat: c.latSum / c.n, lng: c.lngSum / c.n }))
      .sort((a, b) => b.n - a.n || b.tote - a.tote || b.schwer - a.schwer)

    const gewaehlt = []
    for (const c of kandidaten) {
      const zuNah = gewaehlt.some(
        (g) => Math.abs(g.lat - c.lat) < MIN_ABSTAND_LAT && Math.abs(g.lng - c.lng) < MIN_ABSTAND_LNG,
      )
      if (!zuNah) gewaehlt.push(c)
      if (gewaehlt.length >= proStadtMax) break
    }
    ergebnis.push(...gewaehlt)
  }
  return ergebnis
}
