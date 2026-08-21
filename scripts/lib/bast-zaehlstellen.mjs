// Pure Logik der BASt-Auswertung (Verkehrsmengen auf Bundesfernstrassen).
// Ohne Netz und Dateisystem, damit die Fallen testbar sind.

/** Bis hierhin gilt eine Zaehlstelle als "bei" der Stadt. Bei 8 km waeren es
 *  148/173 Staedte, bei 10 km 162 — Autobahnen fuehren am Stadtrand vorbei,
 *  10 km ist dafuer realistisch. Die Entfernung wird IMMER mitgenannt, damit
 *  aus "in der Naehe" keine falsche Praezision wird. */
export const MAX_KM = 10
/** Zwei Zaehlstellen je Stadt reichen fuer einen Absatz. */
export const PRO_STADT = 2

const SPALTEN = ['DZ_Nr', 'DZ_Name', 'Str_Kl', 'Str_Nr', 'Koor_WGS84_N', 'Koor_WGS84_E', 'DTV_Kfz_MobisSo_Q', 'DTV_SV_MobisSo_Q']

/** Spalten ueber Namen aufloesen — die Datei hat 255 davon, Indizes zu raten
 *  waere aussichtslos, und die Reihenfolge ist zwischen Jahrgaengen nicht zugesichert. */
export function spaltenIndizes(kopfzeile) {
  const kopf = kopfzeile.replace(/^﻿/, '').split(';').map((c) => c.trim())
  const idx = {}
  for (const n of SPALTEN) {
    const i = kopf.indexOf(n)
    if (i < 0) throw new Error(`Spalte ${n} fehlt (BASt-Format geaendert?)`)
    idx[n] = i
  }
  idx._anzahl = kopf.length
  return idx
}

/** Deutsche Zahl mit Tausenderpunkt: "171.135" -> 171135, "" -> null. */
export function zahl(roh) {
  const s = String(roh ?? '').trim()
  if (!s) return null
  const n = parseInt(s.replace(/\./g, '').replace(',', '.'), 10)
  return Number.isFinite(n) ? n : null
}

export function koordinate(roh) {
  const n = parseFloat(String(roh ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Luftlinie in km. */
export function distanzKm(lat1, lng1, lat2, lng2) {
  const r = (d) => (d * Math.PI) / 180
  const dLat = r(lat2 - lat1)
  const dLng = r(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Liest die Jahresauswertung.
 *
 * ⚠ DIE FALLE: 638 der 2.127 Zaehlstellen haben KEINEN DTV-Wert (Ausfaelle,
 * unvollstaendige Jahre) — das Feld ist dann leer, nicht 0. Wer nur auf
 * `parseInt` vertraut, schreibt `NaN` oder 0 auf die Seite: "hier fahren
 * taeglich 0 Fahrzeuge" ist eine falsche Aussage ueber einen realen Ort,
 * keine fehlende Angabe. Solche Stellen fliegen raus.
 */
export function leseZaehlstellen(text) {
  const zeilen = text.split(/\r?\n/)
  const I = spaltenIndizes(zeilen[0])
  const stellen = []
  for (let z = 1; z < zeilen.length; z++) {
    const s = zeilen[z].split(';')
    if (s.length < I._anzahl - 5) continue
    const lat = koordinate(s[I.Koor_WGS84_N])
    const lng = koordinate(s[I.Koor_WGS84_E])
    const dtv = zahl(s[I.DTV_Kfz_MobisSo_Q])
    if (lat === null || lng === null || dtv === null || dtv <= 0) continue
    if (lat < 45 || lat > 56 || lng < 5 || lng > 16) continue // ausserhalb DE
    stellen.push({
      nr: String(s[I.DZ_Nr]).trim(),
      name: String(s[I.DZ_Name]).trim(),
      strasse: `${String(s[I.Str_Kl]).trim()}${String(s[I.Str_Nr]).trim()}`,
      lat,
      lng,
      dtv,
      schwerverkehr: zahl(s[I.DTV_SV_MobisSo_Q]) ?? 0,
    })
  }
  return stellen
}

/**
 * Waehlt je Stadt die naechstgelegenen Zaehlstellen.
 *
 * Bevorzugt VERSCHIEDENE Strassen: zwei Messpunkte derselben Autobahn sagen
 * dem Leser nichts Neues, zwei verschiedene Achsen schon.
 */
export function waehleProStadt(staedte, stellen, maxKm = MAX_KM, proStadt = PRO_STADT) {
  const ergebnis = {}
  for (const stadt of staedte) {
    const nah = stellen
      .map((p) => ({ ...p, km: distanzKm(stadt.lat, stadt.lng, p.lat, p.lng) }))
      .filter((p) => p.km <= maxKm)
      .sort((a, b) => a.km - b.km)
    if (nah.length === 0) continue

    const gewaehlt = []
    const strassen = new Set()
    for (const p of nah) {
      if (strassen.has(p.strasse)) continue
      gewaehlt.push(p)
      strassen.add(p.strasse)
      if (gewaehlt.length >= proStadt) break
    }
    // Nur eine Strasse in Reichweite? Dann die naechstgelegene, ohne Fuellwerk.
    if (gewaehlt.length === 0) gewaehlt.push(nah[0])
    ergebnis[stadt.slug] = gewaehlt
  }
  return ergebnis
}
