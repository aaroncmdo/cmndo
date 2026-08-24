// Erzeugt 4-6 Unfallschwerpunkte je Ort der Bonn-Domain aus dem amtlichen
// Unfallatlas — als fertige `unfallHotspots`-Bloecke fuer eine Charge-Datei.
//
// WARUM EIN EIGENES SKRIPT: generate-stadt-unfallhotspots.mjs schreibt die
// GETEILTE Datei claimondo-marketing/lib/kfz-gutachter/stadt-unfallhotspots.json
// fuer alle 162 Staedte neu. Mit einer gesenkten Schwelle wuerde ich damit die
// Daten aller anderen Domains veraendern, obwohl mein Auftrag 10 Orte umfasst.
// Dieses Skript liest dieselben Quellen und Bibliotheken, schreibt aber NUR
// seine eigene Ausgabedatei.
//
// PRO_STADT dort ist 3 (Geocoding-Kosten), der Auftrag verlangt 4-6 — deshalb
// hier 6, mit gestaffelter Schwelle fuer die kleineren Orte.
//
// ⚠ Der Unfallatlas erfasst NUR Unfaelle MIT PERSONENSCHADEN. Jede Beschreibung
// sagt das ausdruecklich — "N Unfaelle" ohne diesen Zusatz waere zu hoch
// gegriffen, weil Blechschaeden gar nicht enthalten sind.
//
// Run: node scripts/hotspots-bonn-cluster.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { zipEintraege } from './lib/zip-lesen.mjs'
import { clusterAusZeilen, waehleProStadt } from './lib/unfall-cluster.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const REPO = join(HIER, '..')
const CACHE = join(HIER, '.unfallatlas-cache')
const GEOCACHE = join(HIER, 'unfallatlas-geocode-cache.json')
const ZIEL = join(HIER, '.hotspots-bonn.json')

const JAHRE = [2021, 2022, 2023, 2024, 2025]
const ZIEL_PRO_ORT = 6
const MIN_PRO_ORT = 4
// Gestaffelt: erst die amtsnahe Schwelle, dann vorsichtig runter. Unter 5
// Unfaellen in fuenf Jahren nenne ich es nicht mehr Schwerpunkt.
const STUFEN = [10, 8, 6, 5]

const SLUGS = ['bonn','sankt-augustin','siegburg','troisdorf','koenigswinter','bad-honnef','hennef','bornheim','rheinbach','meckenheim']

const amtsdaten = JSON.parse(
  readFileSync(join(REPO, 'claimondo-marketing/lib/kfz-gutachter/staedte-amtsdaten.json'), 'utf8'),
)
const agsZuSlug = new Map()
for (const s of SLUGS) {
  const ags = amtsdaten[s]?.ags
  if (!ags) { console.error(`🔴 ${s}: kein AGS in staedte-amtsdaten.json`); process.exit(1) }
  agsZuSlug.set(ags, s)
}
console.log(`AGS aufgeloest: ${agsZuSlug.size}/${SLUGS.length}`)

// --- Jahrgaenge lesen -------------------------------------------------------
const proStadt = new Map()
let gesamt = 0
for (const jahr of JAHRE) {
  const datei = join(CACHE, `Unfallorte${jahr}.zip`)
  if (!existsSync(datei)) { console.error(`🔴 ${jahr}: nicht im Cache`); process.exit(1) }
  const eintraege = zipEintraege(readFileSync(datei))
  const daten = eintraege.sort((a, b) => b.groesse - a.groesse)[0]
  const n = clusterAusZeilen(daten.entpacke().toString('utf8'), agsZuSlug, proStadt)
  gesamt += n
  console.log(`  ${jahr}: ${n.toLocaleString('de-DE')} Unfaelle in den 10 Orten`)
}
console.log(`Summe: ${gesamt.toLocaleString('de-DE')} Unfaelle mit Personenschaden 2021-2025\n`)
if (gesamt === 0) { console.error('🔴 Null Unfaelle — AGS-Abgleich pruefen (8-stellig!).'); process.exit(1) }

// --- Je Ort die Stufen durchgehen ------------------------------------------
const gewaehlt = new Map()
for (const slug of SLUGS) {
  const nur = new Map([[slug, proStadt.get(slug) ?? new Map()]])
  let treffer = []
  let benutzteStufe = null
  for (const stufe of STUFEN) {
    treffer = waehleProStadt(nur, stufe, ZIEL_PRO_ORT)
    benutzteStufe = stufe
    if (treffer.length >= MIN_PRO_ORT) break
  }
  gewaehlt.set(slug, { treffer, stufe: benutzteStufe })
  const warn = treffer.length < MIN_PRO_ORT ? `  ⚠ unter ${MIN_PRO_ORT}` : ''
  console.log(`  ${slug.padEnd(16)} ${String(treffer.length).padStart(2)} Hotspots (Schwelle ${benutzteStufe})${warn}`)
}

// --- Geocoding --------------------------------------------------------------
const schluessel = (c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`
function leseToken() {
  for (const p of [join(REPO, '.env.local'), join(REPO, '../../../.env.local')]) {
    if (!existsSync(p)) continue
    const z = readFileSync(p, 'utf8').split('\n').find((l) => l.startsWith('MAPBOX_ACCESS_TOKEN='))
    if (z) return z.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
  }
  return null
}
const cache = existsSync(GEOCACHE) ? JSON.parse(readFileSync(GEOCACHE, 'utf8')) : {}
const alle = [...gewaehlt.values()].flatMap((g) => g.treffer)
const offen = alle.filter((c) => !cache[schluessel(c)])
console.log(`\nGeocoding: ${alle.length} Cluster, davon ${offen.length} neu`)
if (offen.length > 0) {
  const token = leseToken()
  if (!token) {
    console.error('🔴 Kein MAPBOX_ACCESS_TOKEN — Abbruch statt Haeufungen ohne Strassenname.')
    process.exit(1)
  }
  for (let i = 0; i < offen.length; i++) {
    const c = offen[i]
    const u = `https://api.mapbox.com/geocoding/v5/mapbox.places/${c.lng},${c.lat}.json?types=address&language=de&limit=1&access_token=${token}`
    const r = await fetch(u)
    if (!r.ok) { console.error(`🔴 Mapbox HTTP ${r.status} bei ${c.slug}`); process.exit(1) }
    const f = (await r.json()).features?.[0]
    const ctx = f?.context ?? []
    const finde = (p) => ctx.find((x) => x.id?.startsWith(p))?.text ?? null
    cache[schluessel(c)] = { strasse: f?.text ?? null, stadtteil: finde('neighborhood') ?? finde('locality') ?? null }
    if ((i + 1) % 10 === 0) console.log(`    ${i + 1}/${offen.length}`)
    await new Promise((r2) => setTimeout(r2, 120))
  }
  writeFileSync(GEOCACHE, JSON.stringify(cache, null, 1))
  console.log('  Geocode-Cache aktualisiert')
}

// --- Ausgabe ----------------------------------------------------------------
const QUELLE = 'https://unfallatlas.statistikportal.de/'
const ausgabe = {}
let ohneStrasse = 0
for (const slug of SLUGS) {
  const { treffer, stufe } = gewaehlt.get(slug)
  const liste = []
  for (const c of treffer) {
    const g = cache[schluessel(c)] ?? {}
    if (!g.strasse) { ohneStrasse++; continue } // eine Haeufung ohne Ort ist keine Angabe
    const ort = g.stadtteil && g.stadtteil !== g.strasse ? `${g.strasse} (${g.stadtteil})` : g.strasse
    liste.push({
      ort,
      unfaelle: c.n,
      schwer: c.schwer,
      tote: c.tote,
      lat: Number(c.lat.toFixed(5)),
      lng: Number(c.lng.toFixed(5)),
      quelle: `${QUELLE} (Unfallatlas der Statistischen Ämter des Bundes und der Länder, Erhebungsjahre 2021-2025, Datenlizenz Deutschland 2.0)`,
    })
  }
  ausgabe[slug] = { stufe, hotspots: liste }
}
writeFileSync(ZIEL, JSON.stringify(ausgabe, null, 2))
console.log(`\nGeschrieben: ${ZIEL}`)
if (ohneStrasse) console.log(`⚠ ${ohneStrasse} Cluster ohne Strassenname verworfen`)
for (const slug of SLUGS) console.log(`  ${slug.padEnd(16)} ${ausgabe[slug].hotspots.length} Hotspots`)
