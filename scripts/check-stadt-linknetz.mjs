#!/usr/bin/env node
// Misst das interne Linknetz der Stadtseiten (/kfz-gutachter/<slug>).
//
// WARUM: "Linknetz ausbauen" ist ohne Messung nicht abnehmbar. Vor diesem
// Skript liess sich weder sagen, wie viele Staedte ueberhaupt einen eingehenden
// Link haben, noch ob ein Link ins Leere zeigt. P3-Spec §A3.
//
// Nutzung:
//   node scripts/check-stadt-linknetz.mjs              # Bericht aus den Daten
//   node scripts/check-stadt-linknetz.mjs --check      # exit 1 bei toten Links/Waisen (CI)
//   node scripts/check-stadt-linknetz.mjs --crawl https://claimondo.de
//                                                      # liest die ECHTEN Seiten
//
// DATENMODUS vs. CRAWL — der Unterschied ist wichtig:
// Der Datenmodus rechnet aus denselben Quellen, aus denen die Seite rendert.
// Er ist schnell, braucht kein Netz und laeuft in CI. Er kann aber nur Kanten
// sehen, die er kennt (Liste unten). Der Crawl-Modus liest das ausgelieferte
// HTML und ist damit die einzige Aussage darueber, was wirklich online steht —
// "Statusfelder beweisen nichts, erst der Consumer beweist es".

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analysiereLinknetz } from './lib/stadt-linknetz-scan.mjs'
import { waehleNachbarn } from '../claimondo-marketing/lib/kfz-gutachter/nachbar-auswahl.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STAEDTE_TS = join(ROOT, 'claimondo-marketing', 'lib', 'kfz-gutachter', 'staedte.ts')
const FOOTER_TSX = join(ROOT, 'claimondo-marketing', 'components', 'landing', 'LandingFooter.tsx')
const ROUTEN_DIR = join(ROOT, 'claimondo-marketing', 'app', '[locale]', 'kfz-gutachter')

/** Geschwister-Routen unter /kfz-gutachter/ sind Ratgeber-Seiten (kosten,
 *  ablauf, wertminderung, …), keine Staedte. Ohne diese Liste meldet der Crawl
 *  jeden Ratgeber-Link als toten Stadt-Link — beim ersten Lauf waren das 276
 *  Fehlalarme. Aus dem Dateisystem gelesen, damit die Liste nicht driftet. */
function nichtStadtRouten() {
  return readdirSync(ROUTEN_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== '[stadt]')
    .map((e) => e.name)
}

/** Reissleine gegen einen stillschweigend kaputten Parser. */
const MIN_ERWARTETE_STAEDTE = 50

/** Wie viele eingehende thematische Links eine Stadt mindestens haben sollte. */
const MIN_EINGEHEND = 2

// ---------------------------------------------------------------- Quellen

/** Das STAEDTE-Array; danach folgt HYPERLOCAL_DATA mit gleichnamigen Feldern. */
function staedteBlock(quelltext) {
  const start = quelltext.indexOf('export const STAEDTE')
  if (start < 0) throw new Error('export const STAEDTE nicht gefunden')
  const ende = quelltext.indexOf('\n]', start)
  if (ende < 0) throw new Error('Ende des STAEDTE-Arrays nicht gefunden')
  return quelltext.slice(start, ende)
}

function parseStaedte(quelltext) {
  const re =
    /slug: '([a-z0-9-]+)',\s*\n\s*name: '([^']+)',\s*\n\s*bundesland: '([^']+)',\s*\n\s*plzPrefix: '[^']*',\s*\n\s*bevoelkerung: '([^']+)',\s*\n\s*lat: ([-0-9.]+),\s*\n\s*lng: ([-0-9.]+),/g
  const staedte = []
  let m
  while ((m = re.exec(staedteBlock(quelltext)))) {
    staedte.push({
      slug: m[1],
      name: m[2],
      bundesland: m[3],
      bevoelkerung: m[4],
      lat: Number(m[5]),
      lng: Number(m[6]),
    })
  }
  return staedte
}

/** `angrenzendeOrte` der Hub-Cities — heute Fliesstext, in P3-A2 sollen daraus
 *  Links werden, aber nur dort, wo der Ort eine eigene Seite hat. */
function parseAngrenzendeOrte(quelltext) {
  const treffer = []
  const re = /angrenzendeOrte: \[([^\]]*)\]/g
  let m
  while ((m = re.exec(quelltext))) {
    treffer.push(
      m[1]
        .split(',')
        .map((s) => s.trim().replace(/^'|'$/g, ''))
        .filter(Boolean),
    )
  }
  return treffer
}

/** `spokeLocal.hubSlug` — die Spoke->Hub-Beziehung liegt als Datum vor, wird
 *  aber nirgends verlinkt (P3-A2). */
function parseSpokeHubs(quelltext) {
  const re = /hubSlug: '([a-z0-9-]+)'/g
  const hubs = []
  let m
  while ((m = re.exec(quelltext))) hubs.push(m[1])
  return hubs
}

function parseFooterStandorte(quelltext) {
  const start = quelltext.indexOf('const FOOTER_STANDORTE')
  if (start < 0) throw new Error('FOOTER_STANDORTE nicht gefunden')
  const block = quelltext.slice(start, quelltext.indexOf(']', start))
  return [...block.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1])
}

// ------------------------------------------------------------ Datenmodus

function sammleAusDaten() {
  const quelltext = readFileSync(STAEDTE_TS, 'utf8')
  const staedte = parseStaedte(quelltext)
  if (staedte.length < MIN_ERWARTETE_STAEDTE) {
    throw new Error(
      `nur ${staedte.length} Staedte geparst (erwartet >= ${MIN_ERWARTETE_STAEDTE}).\n` +
        'Wahrscheinlich hat sich die Formatierung von staedte.ts geaendert.\n' +
        'NICHT die Untergrenze senken — den Parser anpassen.',
    )
  }

  const kanten = []

  // 1. Nachbar-Pills im Einsatzgebiet-Block. DIESELBE Funktion, die die Seite
  //    rendert — sonst misst das Skript etwas anderes als der Nutzer sieht.
  for (const s of staedte) {
    for (const ziel of waehleNachbarn(s.slug, staedte, 6)) {
      kanten.push({ von: s.slug, nach: ziel.slug, quelle: 'nachbar' })
    }
  }

  // 2. Footer-Strip: steht auf JEDER Seite -> global, kein thematisches Signal.
  const footer = parseFooterStandorte(readFileSync(FOOTER_TSX, 'utf8'))
  for (const s of staedte) {
    for (const ziel of footer) {
      kanten.push({ von: s.slug, nach: ziel, quelle: 'footer' })
    }
  }

  // 3. Uebersicht /kfz-gutachter listet alle Staedte -> ebenfalls global.
  for (const s of staedte) {
    kanten.push({ von: 'kfz-gutachter', nach: s.slug, quelle: 'hub', vonIstStadt: false })
  }

  return { staedte, kanten, footer, quelltext }
}

// ------------------------------------------------------------ Crawl-Modus

/** Nur die Pills des Einsatzgebiet-Blocks — NICHT jeder /kfz-gutachter/-Link
 *  der Seite. Der Footer-Strip verlinkt auf jeder Seite dieselben zehn Staedte
 *  und wuerde eine naive Zaehlung unbrauchbar machen (16.08. reproduziert:
 *  eine Volltext-Zaehlung meldete weiter "NRW-Staedte auf Berlin"). */
function pillsAusHtml(html) {
  const re =
    /py-1\.5 text-xs font-semibold text-claimondo-ondo[^"]*"\s+href="\/kfz-gutachter\/([a-z0-9-]+)"/g
  return [...html.matchAll(re)].map((m) => m[1])
}

function alleStadtLinks(html) {
  return [...html.matchAll(/href="\/kfz-gutachter\/([a-z0-9-]+)"/g)].map((m) => m[1])
}

async function sammleAusCrawl(basisUrl) {
  const staedte = parseStaedte(readFileSync(STAEDTE_TS, 'utf8'))
  const ratgeber = new Set(nichtStadtRouten())
  const kanten = []
  const fehler = []

  for (const s of staedte) {
    const url = `${basisUrl.replace(/\/$/, '')}/kfz-gutachter/${s.slug}`
    let html = ''
    try {
      const antwort = await fetch(url)
      if (!antwort.ok) {
        fehler.push(`${s.slug}: HTTP ${antwort.status}`)
        continue
      }
      html = await antwort.text()
    } catch (err) {
      fehler.push(`${s.slug}: ${err.message}`)
      continue
    }
    const pills = new Set(pillsAusHtml(html))
    for (const ziel of pills) {
      kanten.push({ von: s.slug, nach: ziel, quelle: 'nachbar' })
    }
    // Alles, was NICHT Pill und keine Ratgeber-Route ist, als globalen Strip
    // verbuchen (Footer etc.).
    for (const ziel of alleStadtLinks(html)) {
      if (pills.has(ziel) || ratgeber.has(ziel)) continue
      kanten.push({ von: s.slug, nach: ziel, quelle: 'footer' })
    }
  }

  return { staedte, kanten, fehler, ratgeber: [...ratgeber] }
}

// ---------------------------------------------------------------- Bericht

function zeile(titel, wert) {
  console.log(`  ${titel.padEnd(34)} ${wert}`)
}

function berichte(ergebnis, extras) {
  const { kennzahl } = ergebnis
  console.log('\nSTADT-LINKNETZ\n')
  zeile('Stadtseiten', kennzahl.staedte)
  zeile('thematische Kanten', kennzahl.thematischeKanten)
  zeile(
    'eingehend je Stadt (min/Ø/max)',
    `${kennzahl.eingehendMin} / ${kennzahl.eingehendSchnitt.toFixed(1)} / ${kennzahl.eingehendMax}`,
  )
  console.log('\n  Kanten je Quelle:')
  for (const [quelle, anzahl] of Object.entries(kennzahl.jeQuelle).sort()) {
    const marke = ['footer', 'hub'].includes(quelle) ? ' (global, zaehlt nicht thematisch)' : ''
    zeile(`  ${quelle}`, `${anzahl}${marke}`)
  }

  console.log('\nBEFUNDE\n')
  zeile('tote Links', ergebnis.toteLinks.length)
  for (const t of ergebnis.toteLinks) console.log(`     ${t.von} -> ${t.nach}  [${t.quelle}]`)
  zeile('Waisen (0 thematisch eingehend)', ergebnis.waisen.length)
  for (const w of ergebnis.waisen) console.log(`     ${w}`)
  zeile(`unter ${MIN_EINGEHEND} eingehenden`, ergebnis.schwach.length)
  for (const s of ergebnis.schwach.slice(0, 20)) console.log(`     ${s.slug} (${s.eingehend})`)
  if (ergebnis.schwach.length > 20) console.log(`     … und ${ergebnis.schwach.length - 20} weitere`)
  zeile('einseitige Kanten A->B ohne B->A', ergebnis.einseitig.length)

  if (extras?.nichtErfasst?.length) {
    // Ohne diesen Abschnitt liest sich "0 tote Links" wie eine Vollpruefung.
    console.log('\nNICHT ERFASST (dieser Lauf sieht diese Kanten nicht)\n')
    for (const z of extras.nichtErfasst) console.log(`  - ${z}`)
  }
  if (extras?.geplant?.length) {
    console.log('\nVORHANDENE DATEN OHNE LINK (Material fuer P3-A2)\n')
    for (const z of extras.geplant) console.log(`  - ${z}`)
  }
  if (extras?.fehler?.length) {
    console.log('\nNICHT ABRUFBAR\n')
    for (const z of extras.fehler) console.log(`  - ${z}`)
  }
}

// ------------------------------------------------------------------- main

async function main() {
  const nurPruefen = process.argv.includes('--check')
  const crawlIndex = process.argv.indexOf('--crawl')
  const basisUrl = crawlIndex >= 0 ? process.argv[crawlIndex + 1] : null

  if (crawlIndex >= 0 && !basisUrl) {
    console.error('FEHLER: --crawl braucht eine Basis-URL, z.B. --crawl https://claimondo.de')
    process.exit(1)
  }

  let staedte
  let kanten
  const extras = {}

  if (basisUrl) {
    console.log(`crawle ${basisUrl} …`)
    const r = await sammleAusCrawl(basisUrl)
    staedte = r.staedte
    kanten = r.kanten
    extras.fehler = r.fehler
    extras.nichtErfasst = [
      'Links von Nicht-Stadtseiten (Startseite, /ratgeber, /schadensreport-2026) — es werden nur die 92 Stadtseiten abgerufen',
      `Ratgeber-Geschwister unter /kfz-gutachter/ (${r.ratgeber.length}: ${r.ratgeber.join(', ')}) — als Nicht-Staedte ausgefiltert, nicht als tote Links gezaehlt`,
    ]
  } else {
    const r = sammleAusDaten()
    staedte = r.staedte
    kanten = r.kanten

    const slugSet = new Set(staedte.map((s) => s.slug))
    const nachName = new Map(staedte.map((s) => [s.name, s.slug]))

    const angrenzend = parseAngrenzendeOrte(r.quelltext)
    const angrenzendMitSeite = angrenzend.flat().filter((ort) => nachName.has(ort))
    const spokeHubs = parseSpokeHubs(r.quelltext)

    extras.geplant = [
      `angrenzendeOrte: ${angrenzend.flat().length} Ortsnamen auf ${angrenzend.length} Hub-Seiten, davon ${angrenzendMitSeite.length} mit eigener Stadtseite — heute Fliesstext, kein Link`,
      `spokeLocal.hubSlug: ${spokeHubs.length} Spoke->Hub-Beziehungen gepflegt, keine davon verlinkt`,
      ...spokeHubs.filter((h) => !slugSet.has(h)).map((h) => `hubSlug '${h}' hat KEINE Stadtseite`),
    ]
    extras.nichtErfasst = [
      'Links von der Startseite, /ratgeber und /schadensreport-2026 (dort werden Slugs teils zur Laufzeit abgeleitet)',
      'ob die Seite den Block wirklich ausliefert — dafuer: --crawl <url>',
    ]
  }

  const ergebnis = analysiereLinknetz({
    slugs: staedte.map((s) => s.slug),
    kanten,
    minEingehend: MIN_EINGEHEND,
  })

  berichte(ergebnis, extras)

  // Blockend sind nur die beiden harten Fehler. Einseitige Kanten sind in einem
  // distanzbasierten Netz strukturell normal (Duesseldorf hat sechs Grossstaedte
  // naeher als Koeln) — sie zu blocken hiesse, ein Gate zu bauen, das nie gruen
  // werden kann.
  if (nurPruefen) {
    const gruende = []
    if (ergebnis.toteLinks.length) {
      gruende.push(`${ergebnis.toteLinks.length} tote Links (404 fuer Nutzer und Crawler)`)
    }
    if (ergebnis.waisen.length) {
      gruende.push(
        `${ergebnis.waisen.length} Waisen (${ergebnis.waisen.join(', ')}) — von keiner anderen Stadtseite erreichbar`,
      )
    }
    if (gruende.length) {
      console.error(`\nFEHLER: ${gruende.join('; ')}.`)
      process.exit(1)
    }
    console.log('\nOK — keine toten Links, keine Waisen.')
  }
}

main().catch((err) => {
  console.error(`FEHLER: ${err.message}`)
  process.exit(1)
})
