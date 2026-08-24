#!/usr/bin/env node
// Erzeugt claimondo-marketing/lib/kfz-gutachter/staedte-amtsdaten.json:
// amtlicher Gemeindeschluessel (AGS) + Fahrzeugbestand je Stadt.
//
// WOFUER: Gemessen am 20.08.2026 sind 166 von 173 Stadtseiten untereinander
// ~93 % identisch — nur 3 von 135 Textbloecken sind eigenstaendig. Der
// KI-Lokalinhalt ist der einzige Unterscheider, aber die KI kann keine
// belegbaren Zahlen liefern (Quellenzwang verlangt eine echte Quell-URL).
// Amtliche Daten schliessen genau diese Luecke: Zahlen MIT Quelle, ohne
// KI-Kosten, fuer alle 173 Staedte gleichzeitig.
//
// Der AGS ist dabei die Bruecke zu JEDER weiteren amtlichen Quelle
// (Unfallatlas, Destatis) — er faellt hier als Nebenprodukt ab.
//
// Quelle: KBA FZ 3 "Bestand an Kraftfahrzeugen nach Gemeinden",
//         Datenlizenz Deutschland 2.0 / Namensnennung.
//
// Run:
//   node scripts/generate-stadt-amtsdaten.mjs                 (laedt vom KBA)
//   node scripts/generate-stadt-amtsdaten.mjs --datei fz3.xlsx (lokale Kopie)
//   node scripts/generate-stadt-amtsdaten.mjs --check          (nur pruefen, ohne Netz)

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { einwohnerAusText, ordneStaedteZu } from './lib/ags-zuordnung.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ZIEL = join(ROOT, 'claimondo-marketing/lib/kfz-gutachter/staedte-amtsdaten.json')
const QUELLE_URL =
  'https://www.kba.de/SharedDocs/Downloads/DE/Statistik/Fahrzeuge/FZ3/fz3_2026.xlsx?__blob=publicationFile'

/**
 * Vier Staedte schreibt das KBA so ab, dass kein Namensabgleich greift.
 *
 * ⚠ `monheim-am-rhein` ist die gefaehrlichste Zeile: es gibt ZWEI Gemeinden
 * namens "MONHEIM,ST." — 09779186 liegt in Bayern (4.191 Pkw), unsere ist
 * 05158026 am Rhein (25.631 Pkw). Ein Namenstreffer haette hier eine falsche
 * Zahl geliefert, ohne dass irgendetwas rot geworden waere.
 */
const AGS_OVERRIDES = {
  hamburg: '02000000', //              KBA: HAMBURG-STADT
  ludwigshafen: '07314000', //         KBA: LUDWIGSHAFEN A.RH.
  'muelheim-an-der-ruhr': '05117000', // KBA: MUELHEIM A.D.RUHR
  'monheim-am-rhein': '05158026', //   KBA: MONHEIM,ST. (NICHT 09779186 = Bayern)
}

const argv = process.argv.slice(2)
const nurPruefen = argv.includes('--check')
const dateiIdx = argv.indexOf('--datei')
const lokaleDatei = dateiIdx > -1 ? argv[dateiIdx + 1] : null

// --- Staedteliste (dieselbe, die die Seiten rendern) -----------------------
const staedteQuelle = readFileSync(
  join(ROOT, 'claimondo-marketing/lib/kfz-gutachter/staedte.ts'),
  'utf8',
)
const staedte = [
  ...staedteQuelle.matchAll(
    /^\s*slug: '([a-z0-9-]+)',\s*\n\s*name: '([^']+)',[\s\S]*?bevoelkerung: '([^']+)',/gm,
  ),
].map((m) => ({ slug: m[1], name: m[2], einwohner: einwohnerAusText(m[3]) }))

if (staedte.length === 0) {
  console.error('FEHLER: keine Staedte aus staedte.ts gelesen — Format geaendert?')
  process.exit(1)
}

// --- --check: nur Vollstaendigkeit, ohne Netz ------------------------------
if (nurPruefen) {
  if (!existsSync(ZIEL)) {
    console.error(`[amtsdaten] ✗ ${ZIEL} fehlt. Erzeugen mit: node scripts/generate-stadt-amtsdaten.mjs`)
    process.exit(1)
  }
  const bestand = JSON.parse(readFileSync(ZIEL, 'utf8'))
  const fehlend = staedte.filter((s) => !(s.slug in bestand)).map((s) => s.slug)
  if (fehlend.length) {
    console.error(
      `[amtsdaten] ✗ ${fehlend.length} Stadt/Staedte ohne Amtsdaten:\n  ${fehlend.join(', ')}\n\n` +
        'Neu erzeugen mit:  node scripts/generate-stadt-amtsdaten.mjs',
    )
    process.exit(1)
  }
  console.log(`[amtsdaten] ✓ alle ${staedte.length} Staedte haben Amtsdaten.`)
  process.exit(0)
}

// --- KBA-Datei beschaffen --------------------------------------------------
const arbeitsordner = mkdtempSync(join(tmpdir(), 'kba-'))
let xlsxPfad = lokaleDatei
if (!xlsxPfad) {
  xlsxPfad = join(arbeitsordner, 'fz3.xlsx')
  console.log('lade KBA FZ 3 …')
  const res = await fetch(QUELLE_URL)
  if (!res.ok) {
    console.error(`FEHLER: KBA-Download HTTP ${res.status}`)
    process.exit(1)
  }
  writeFileSync(xlsxPfad, Buffer.from(await res.arrayBuffer()))
}

// --- XLSX lesen (ZIP + XML, ohne Zusatz-Abhaengigkeit) ---------------------
const entpackt = join(arbeitsordner, 'x')
execSync(`unzip -o -q "${xlsxPfad}" -d "${entpackt}"`)

const strings = []
for (const m of readFileSync(join(entpackt, 'xl/sharedStrings.xml'), 'utf8').matchAll(
  /<si>([\s\S]*?)<\/si>/g,
)) {
  strings.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''))
}

// Datenblatt "FZ 3.1" ueber die Blattnamen finden, nicht ueber die Position —
// eine neue Jahresausgabe koennte ein Blatt einschieben.
const workbook = readFileSync(join(entpackt, 'xl/workbook.xml'), 'utf8')
const blaetter = [...workbook.matchAll(/<sheet name="([^"]*)"[^>]*r:id="rId(\d+)"/g)]
const fz31 = blaetter.find(([, name]) => name.replace(/\s/g, '').toUpperCase().startsWith('FZ3.1'))
if (!fz31) {
  console.error(`FEHLER: Blatt "FZ 3.1" nicht gefunden. Vorhanden: ${blaetter.map((b) => b[1]).join(', ')}`)
  process.exit(1)
}
const sheetDatei = `sheet${blaetter.indexOf(fz31) + 1}.xml`
const sheet = readFileSync(join(entpackt, `xl/worksheets/${sheetDatei}`), 'utf8')

/** Spalte D traegt "<8-stelliger AGS> <NAME>", F..L die Bestandszahlen. */
const gemeinden = []
for (const [, , inhalt] of sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const z = {}
  for (const [, sp, typ, v] of inhalt.matchAll(
    /<c r="([A-Z]+)\d+"(?:[^>]*t="(\w+)")?[^>]*>(?:<v>([^<]*)<\/v>)?/g,
  )) {
    if (v !== undefined) z[sp] = typ === 's' ? strings[Number(v)] : v
  }
  const m = z.D && /^(\d{8})\s+(.+)$/.exec(String(z.D).trim())
  if (!m) continue
  gemeinden.push({
    ags: m[1],
    name: m[2],
    kraftraeder: Number(z.E) || 0,
    pkw: Number(z.F) || 0,
    pkwGewerblich: Number(z.G) || 0,
    lkw: Number(z.H) || 0,
    zugmaschinen: Number(z.I) || 0,
    sonstige: Number(z.K) || 0,
    anhaenger: Number(z.L) || 0,
  })
}

if (gemeinden.length < 5000) {
  console.error(`FEHLER: nur ${gemeinden.length} Gemeinden gelesen — Deutschland hat ~10.700. Format geaendert?`)
  process.exit(1)
}

// --- Zuordnen ---------------------------------------------------------------
const { treffer, ohneTreffer, auffaellig } = ordneStaedteZu(staedte, gemeinden, AGS_OVERRIDES)
const nachAgs = new Map(gemeinden.map((g) => [g.ags, g]))

const ergebnis = {}
for (const slug of Object.keys(treffer).sort()) {
  const g = nachAgs.get(treffer[slug].ags)
  ergebnis[slug] = {
    ags: g.ags,
    kbaName: g.name,
    kfz: {
      pkw: g.pkw,
      pkwGewerblich: g.pkwGewerblich,
      lkw: g.lkw,
      kraftraeder: g.kraftraeder,
      anhaenger: g.anhaenger,
    },
    stand: 'FZ 3 (KBA), 1. Januar 2026',
    quelle: 'https://www.kba.de/DE/Statistik/Produktkatalog/produkte/Fahrzeuge/fz3_b_uebersicht.html',
  }
}

writeFileSync(ZIEL, `${JSON.stringify(ergebnis, null, 2)}\n`, 'utf8')

console.log(`\n[amtsdaten] ${Object.keys(ergebnis).length} von ${staedte.length} Staedten geschrieben.`)
console.log(`  Gemeinden in der KBA-Datei: ${gemeinden.length}`)
if (ohneTreffer.length) console.log(`  🔴 OHNE Treffer: ${ohneTreffer.join(', ')}`)
if (auffaellig.length) {
  console.log(`\n  ⚠ auffaellige Motorisierung (ansehen, nicht automatisch verwerfen):`)
  for (const a of auffaellig) {
    console.log(`     ${a.slug.padEnd(20)} ${String(a.pkw).padStart(7)} Pkw / ${String(a.einwohner).padStart(9)} Ew = ${a.quote}`)
  }
}
