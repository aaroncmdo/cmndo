// Erzeugt claimondo-marketing/lib/kfz-gutachter/stadt-verkehrsmengen.json aus
// der BASt-Jahresauswertung der automatischen Dauerzaehlstellen.
//
// WOFUER: Die Unfallhaeufungen (Etappe 3) sagen WO es kracht, aber nicht, wie
// viel Verkehr dort ueberhaupt unterwegs ist. Die Verkehrsmenge ist der
// Kontext dazu — und der einzige harte Ortsfakt, der erklaert, warum eine
// Achse mehr Unfaelle traegt als eine Nebenstrasse. Ausserdem beziffert der
// Schwerverkehrsanteil das Lkw-Risiko, ein Kern-Gutachterthema.
//
// LAUF:  node scripts/generate-stadt-verkehrsmengen.mjs
//        Jaehrlich, sobald die BASt einen neuen Jahrgang veroeffentlicht.
//
// ⚠ Die URL hat sich 2024 geaendert: der alte Pfad
//   /DE/Verkehrstechnik/Fachthemen/v2-verkehrszaehlung/... liefert eine
//   122-KB-404-SEITE mit HTTP 404. Aktuell ist /DE/Themen/Digitales/HF_1/...
//   samt `?view=renderTcDataExportCSV`.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { leseZaehlstellen, waehleProStadt, MAX_KM, PRO_STADT } from './lib/bast-zaehlstellen.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const REPO = join(HIER, '..')
const CACHE = join(HIER, '.bast-cache')
const ZIEL = join(REPO, 'claimondo-marketing/lib/kfz-gutachter/stadt-verkehrsmengen.json')

const JAHR = 2024 // letzter vollstaendig veroeffentlichter Jahrgang
const URL = `https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/verkehrszaehlung/Daten/${JAHR}_1/Jawe${JAHR}.csv?view=renderTcDataExportCSV`
const QUELLE = 'https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/verkehrszaehlung/zaehl_node.html'
const LIZENZ = 'Bundesanstalt für Straßenwesen (BASt), Automatische Dauerzählstellen'

/**
 * Stadt-Koordinaten aus staedte.ts ziehen.
 *
 * Regex statt Import, weil das Skript .mjs ist und staedte.ts TypeScript.
 * Der GUARD dahinter ist das Wesentliche: findet der Regex weniger Staedte als
 * die Amtsdaten kennen, bricht der Lauf ab. Ohne ihn liefert eine geaenderte
 * Formatierung in staedte.ts stillschweigend eine Teilmenge — und die fehlenden
 * Staedte haetten einfach keine Sektion, ohne dass etwas fehlschlaegt.
 */
function leseStaedte() {
  const src = readFileSync(join(REPO, 'claimondo-marketing/lib/kfz-gutachter/staedte.ts'), 'utf8')
  const staedte = []
  const re = /slug:\s*'([^']+)'[\s\S]{0,900}?lat:\s*([\d.]+)[\s\S]{0,120}?lng:\s*([\d.]+)/g
  let m
  while ((m = re.exec(src))) staedte.push({ slug: m[1], lat: +m[2], lng: +m[3] })

  const erwartet = Object.keys(
    JSON.parse(readFileSync(join(REPO, 'claimondo-marketing/lib/kfz-gutachter/staedte-amtsdaten.json'), 'utf8')),
  ).length
  if (staedte.length < erwartet) {
    throw new Error(
      `Nur ${staedte.length} von ${erwartet} Staedten aus staedte.ts gelesen — ` +
        `Format geaendert? Abbruch statt stiller Teilmenge.`,
    )
  }
  return staedte
}

async function ladeJahrgang() {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true })
  const datei = join(CACHE, `Jawe${JAHR}.csv`)
  if (!existsSync(datei)) {
    process.stdout.write(`  ${JAHR} laden … `)
    const r = await fetch(URL)
    if (!r.ok) throw new Error(`HTTP ${r.status} bei ${URL}`)
    const buf = Buffer.from(await r.arrayBuffer())
    // ⚠ Die BASt liefert latin1, nicht UTF-8 — sonst wird aus "Südost" Müll.
    if (buf.length < 500_000) throw new Error(`Nur ${buf.length} Bytes — vermutlich die 404-Seite`)
    writeFileSync(datei, buf)
    console.log(`${buf.length.toLocaleString('de-DE')} Bytes`)
  }
  return readFileSync(datei, 'latin1')
}

// ─── Lauf ──────────────────────────────────────────────────────────────────

const staedte = leseStaedte()
console.log(`Staedte mit Koordinaten: ${staedte.length}\n`)

const text = await ladeJahrgang()
const stellen = leseZaehlstellen(text)
const roh = text.split(/\r?\n/).length - 2
console.log(`Zaehlstellen: ${roh} gesamt -> ${stellen.length} nutzbar`)
console.log(`  (${roh - stellen.length} ohne DTV-Wert oder Koordinate verworfen)\n`)

const zuordnung = waehleProStadt(staedte, stellen)
const versorgt = Object.keys(zuordnung).length
console.log(`Zuordnung: <= ${MAX_KM} km, max ${PRO_STADT} je Stadt (verschiedene Strassen bevorzugt)`)
console.log(`  ${versorgt}/${staedte.length} Staedte versorgt`)
console.log(`  ${staedte.length - versorgt} ohne Zaehlstelle in Reichweite\n`)

const ausgabe = {}
for (const [slug, liste] of Object.entries(zuordnung)) {
  ausgabe[slug] = {
    jahr: JAHR,
    quelle: QUELLE,
    lizenz: LIZENZ,
    zaehlstellen: liste.map((p) => ({
      strasse: p.strasse,
      name: p.name,
      /** Luftlinie zum Stadtzentrum — gehoert IMMER in die Aussage, sonst wird
       *  aus "naechstgelegene Zaehlstelle" ein "in der Stadt". */
      entfernungKm: Math.round(p.km * 10) / 10,
      fahrzeugeProTag: p.dtv,
      schwerverkehrProTag: p.schwerverkehr,
    })),
  }
}

writeFileSync(ZIEL, `${JSON.stringify(ausgabe, null, 1)}\n`)
console.log(`${ZIEL.split(/[\\/]/).pop()} geschrieben`)
console.log(`  Staedte: ${versorgt}`)
console.log(`  Zaehlstellen gesamt: ${Object.values(ausgabe).reduce((a, s) => a + s.zaehlstellen.length, 0)}`)
