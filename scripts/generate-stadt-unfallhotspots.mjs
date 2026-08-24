// Erzeugt claimondo-marketing/lib/kfz-gutachter/stadt-unfallhotspots.json
// aus dem amtlichen Unfallatlas.
//
// WOFUER: Die generierten Ortsinhalte lassen EINE Substanz-Kategorie
// systematisch leer — Unfallschwerpunkte (4 von 5 Staedten null). Der
// Quellenzwang verlangt eine belegbare URL, das Modell kennt keine und laesst
// korrekt weg. Besseres Prompting hilft dort nicht, nur eine Datenquelle.
// Diese hier deckt 160 von 173 Staedten SOFORT ab, ohne KI-Kosten und ohne auf
// die ~2 Staedte pro Nacht zu warten.
//
// LAUF:  node scripts/generate-stadt-unfallhotspots.mjs
//        (Erstlauf ~10 Min: 62 MB Download + 450 Mapbox-Aufrufe.
//         Folgelaeufe Sekunden — Downloads und Geocoding sind gecacht.)
//        Jaehrlich, wenn ein neuer Jahrgang erscheint.
//
// ⚠ MAPBOX_ACCESS_TOKEN muss in .env.local stehen (nur fuer NEUE Cluster
//   noetig — der committete Geocode-Cache deckt den Bestand ab).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { zipEintraege } from './lib/zip-lesen.mjs'
import { clusterAusZeilen, waehleProStadt, SCHWELLE, PRO_STADT } from './lib/unfall-cluster.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const REPO = join(HIER, '..')
const CACHE = join(HIER, '.unfallatlas-cache')
const GEOCACHE = join(HIER, 'unfallatlas-geocode-cache.json') // committet: spart 450 Aufrufe
const ZIEL = join(REPO, 'claimondo-marketing/lib/kfz-gutachter/stadt-unfallhotspots.json')

// Fuenf Jahrgaenge: die amtliche Unfallhaeufungsstelle ist auf der
// 3-Jahres-Karte definiert; fuenf geben auch kleineren Staedten eine
// belastbare Zahl, ohne dass die Daten veralten.
const JAHRE = [2021, 2022, 2023, 2024, 2025]
const BASIS = 'https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas'

const QUELLE = 'https://unfallatlas.statistikportal.de/'
const LIZENZ = 'Statistische Ämter des Bundes und der Länder, Unfallatlas — Datenlizenz Deutschland 2.0'

async function ladeJahrgang(jahr) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true })
  const datei = join(CACHE, `Unfallorte${jahr}.zip`)
  if (!existsSync(datei)) {
    // ⚠ Der Pfad ist FLACH — .../unfallatlas/Unfallorte2025_….zip.
    // Mit Jahres-Unterordner gibt es 404.
    const url = `${BASIS}/Unfallorte${jahr}_EPSG25832_CSV.zip`
    process.stdout.write(`  ${jahr} laden … `)
    const r = await fetch(url)
    if (!r.ok) throw new Error(`${jahr}: HTTP ${r.status} bei ${url}`)
    writeFileSync(datei, Buffer.from(await r.arrayBuffer()))
    console.log(`${(await (await fetch(url)).arrayBuffer()).byteLength.toLocaleString('de-DE')} Bytes`)
  }
  // Groesste Datei im ZIP = die Daten. NICHT nach Endung filtern: 2021 liefert
  // .txt, 2025 .csv — ein `*.csv`-Filter verschluckt einen ganzen Jahrgang
  // still, und das Ergebnis waere "weniger Unfaelle" statt "Datei fehlt".
  const eintraege = zipEintraege(readFileSync(datei))
  const daten = eintraege.sort((a, b) => b.groesse - a.groesse)[0]
  if (!daten || daten.groesse < 1_000_000) throw new Error(`${jahr}: keine Datendatei im ZIP`)
  return daten.entpacke().toString('utf8')
}

async function geocodiere(cluster) {
  const cache = existsSync(GEOCACHE) ? JSON.parse(readFileSync(GEOCACHE, 'utf8')) : {}
  const offen = cluster.filter((c) => !cache[schluessel(c)])
  if (offen.length === 0) {
    console.log(`  alle ${cluster.length} aus dem Cache`)
    return cache
  }

  const token = leseToken()
  if (!token) {
    throw new Error(
      `${offen.length} Cluster ohne Geocoding und kein MAPBOX_ACCESS_TOKEN in .env.local — ` +
        `Abbruch statt Strassennamen wegzulassen (eine Haeufung ohne Ort ist keine Angabe).`,
    )
  }
  console.log(`  ${offen.length} neu zu geocodieren (${cluster.length - offen.length} aus dem Cache)`)

  for (let i = 0; i < offen.length; i++) {
    const c = offen[i]
    // types=address liefert die naechstgelegene Adresse; wir nehmen daraus NUR
    // den Strassennamen — der Cluster ist ein ~100-m-Bereich, keine Hausnummer.
    const u = `https://api.mapbox.com/geocoding/v5/mapbox.places/${c.lng},${c.lat}.json?types=address&language=de&limit=1&access_token=${token}`
    const r = await fetch(u)
    if (!r.ok) throw new Error(`Mapbox HTTP ${r.status} bei ${c.slug}`)
    const f = (await r.json()).features?.[0]
    const ctx = f?.context ?? []
    const finde = (p) => ctx.find((x) => x.id?.startsWith(p))?.text ?? null
    cache[schluessel(c)] = {
      strasse: f?.text ?? null,
      stadtteil: finde('neighborhood') ?? finde('locality') ?? null,
    }
    if ((i + 1) % 50 === 0) {
      writeFileSync(GEOCACHE, JSON.stringify(cache, null, 1))
      console.log(`    ${i + 1}/${offen.length}`)
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  writeFileSync(GEOCACHE, JSON.stringify(cache, null, 1))
  return cache
}

const schluessel = (c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`

function leseToken() {
  for (const p of [join(REPO, '.env.local'), join(REPO, '../../../.env.local')]) {
    if (!existsSync(p)) continue
    const z = readFileSync(p, 'utf8').split('\n').find((l) => l.startsWith('MAPBOX_ACCESS_TOKEN='))
    if (z) return z.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
  }
  return null
}

// ─── Lauf ──────────────────────────────────────────────────────────────────

const amtsdaten = JSON.parse(
  readFileSync(join(REPO, 'claimondo-marketing/lib/kfz-gutachter/staedte-amtsdaten.json'), 'utf8'),
)
const agsZuSlug = new Map()
for (const [slug, d] of Object.entries(amtsdaten)) if (d.ags) agsZuSlug.set(d.ags, slug)
console.log(`AGS-Basis: ${agsZuSlug.size} Staedte\n`)

console.log('Jahrgaenge:')
const proStadt = new Map()
let gesamt = 0
for (const jahr of JAHRE) {
  const text = await ladeJahrgang(jahr)
  const n = clusterAusZeilen(text, agsZuSlug, proStadt)
  gesamt += n
  console.log(`  ${jahr}: ${n.toLocaleString('de-DE')} Unfaelle in unseren Staedten`)
}
console.log(`  ── ${gesamt.toLocaleString('de-DE')} gesamt\n`)

const auswahl = waehleProStadt(proStadt)
console.log(`Auswahl: >=${SCHWELLE} Unfaelle / ${JAHRE.length} Jahre, max ${PRO_STADT} je Stadt`)
console.log(`  ${auswahl.length} Cluster in ${new Set(auswahl.map((c) => c.slug)).size} Staedten\n`)

console.log('Geocoding:')
const geo = await geocodiere(auswahl)

// ─── JSON bauen ────────────────────────────────────────────────────────────

const ausgabe = {}
let ohneStrasse = 0
for (const c of auswahl) {
  const g = geo[schluessel(c)] ?? {}
  if (!g.strasse) { ohneStrasse++; continue } // ohne Ortsangabe keine Aussage
  ;(ausgabe[c.slug] ??= { zeitraum: `${JAHRE[0]}–${JAHRE.at(-1)}`, quelle: QUELLE, lizenz: LIZENZ, hotspots: [] })
    .hotspots.push({
      strasse: g.strasse,
      stadtteil: g.stadtteil,
      unfaelle: c.n,
      schwerverletzte: c.schwer,
      getoetete: c.tote,
      lat: Number(c.lat.toFixed(5)),
      lng: Number(c.lng.toFixed(5)),
    })
}
for (const s of Object.values(ausgabe)) s.hotspots.sort((a, b) => b.unfaelle - a.unfaelle)

writeFileSync(ZIEL, `${JSON.stringify(ausgabe, null, 1)}\n`)
console.log(`\n${ZIEL.split(/[\\/]/).pop()} geschrieben`)
console.log(`  Staedte: ${Object.keys(ausgabe).length}/${agsZuSlug.size}`)
console.log(`  Hotspots: ${Object.values(ausgabe).reduce((a, s) => a + s.hotspots.length, 0)}`)
if (ohneStrasse) console.log(`  ⚠ ${ohneStrasse} Cluster ohne Strassenname verworfen`)
