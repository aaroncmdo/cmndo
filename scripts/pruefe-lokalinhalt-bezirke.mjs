// Prueft handgeschriebene Stadtbezirke gegen eine UNABHAENGIGE Quelle.
//
// WOFUER: Die Ortsinhalte entstehen aus Modellwissen. Bei Grossstaedten ist das
// verlaesslich, aber je kleiner der Ort, desto groesser die Gefahr, einen
// Stadtteil PLAUSIBEL statt RICHTIG zu schreiben — und ein erfundener Ortsteil
// auf einer Seite ueber einen realen Ort ist eine Tatsachenbehauptung.
//
// DIE QUELLE liegt schon im Repo: `unfallatlas-geocode-cache.json` enthaelt zu
// jeder Unfallhaeufung den von Mapbox aufgeloesten Stadtteil — unabhaengig
// erhoben, nicht aus demselben Modellwissen. Ueberschneidet sich meine Liste
// mit dieser, ist sie bestaetigt.
//
// ⚠ Das ist eine STICHPROBE, kein Beweis: Mapbox kennt nur die Stadtteile, in
// denen zufaellig eine Unfallhaeufung liegt (2-3 je Stadt). Eine hohe Quote
// belegt, dass die Liste im richtigen Ort spielt; sie belegt nicht, dass jeder
// einzelne Ortsteil existiert.
//
// LAUF: node scripts/pruefe-lokalinhalt-bezirke.mjs <charge.json>

import { readFileSync } from 'node:fs'

const datei = process.argv.find((a) => a.endsWith('.json'))
if (!datei) throw new Error('Aufruf: node scripts/pruefe-lokalinhalt-bezirke.mjs <charge.json>')

const cache = JSON.parse(readFileSync('./scripts/unfallatlas-geocode-cache.json', 'utf8'))
const hotspots = JSON.parse(
  readFileSync('./claimondo-marketing/lib/kfz-gutachter/stadt-unfallhotspots.json', 'utf8'),
)
const charge = JSON.parse(readFileSync(datei, 'utf8'))

const mapbox = {}
for (const [slug, d] of Object.entries(hotspots)) {
  for (const h of d.hotspots) {
    const g = cache[`${h.lat.toFixed(5)},${h.lng.toFixed(5)}`]
    if (g?.stadtteil) (mapbox[slug] ??= new Set()).add(g.stadtteil)
  }
}

/**
 * ⚠ `Saint` ausschreiben ist dieselbe Sache wie `St.` — Mapbox schreibt
 * „Saint Lorenz Süd", die Stadt selbst „St. Lorenz Süd". Ohne diese
 * Normalisierung meldet der Abgleich zwei Fehltreffer, die keine sind.
 */
const norm = (s) =>
  s.toLowerCase().replace(/[-\s]/g, '').replace(/^(st\.|sankt|saint)/, 'st')

console.log(`Quelle: ${datei.split(/[\\/]/).pop()}\n`)
console.log('Stadt            Mapbox  bestaetigt   fehlt in meiner Liste')
console.log('─'.repeat(84))

let gesamt = 0
let getroffen = 0
const offen = []

for (const [slug, d] of Object.entries(charge)) {
  const mb = mapbox[slug]
  if (!mb) {
    console.log(`  ${slug.padEnd(15)}   —     (keine Unfallhaeufung -> keine Gegenprobe moeglich)`)
    continue
  }
  const meine = d.stadtbezirke.flatMap((b) => [b.name, ...(b.ortsteile ?? [])]).map(norm)
  const fehlt = [...mb].filter((t) => {
    const n = norm(t)
    return !meine.some((m) => m === n || m.includes(n) || n.includes(m))
  })
  gesamt += mb.size
  getroffen += mb.size - fehlt.length
  if (fehlt.length) offen.push(`${slug}: ${fehlt.join(', ')}`)
  console.log(
    `  ${slug.padEnd(15)}${String(mb.size).padStart(4)}   ${String(mb.size - fehlt.length).padStart(4)}       ${fehlt.join(', ')}`,
  )
}

console.log('─'.repeat(84))
const quote = gesamt ? Math.round((getroffen / gesamt) * 100) : 0
console.log(`  ${getroffen}/${gesamt} bestaetigt (${quote} %)`)
if (offen.length) {
  console.log('\n⚠ Nachschlagen — Mapbox kennt sie, meine Liste nicht:')
  for (const o of offen) console.log(`   ${o}`)
  console.log('   Im Zweifel WEGLASSEN: eine kuerzere Liste ist besser als ein erfundener Ortsteil.')
}
