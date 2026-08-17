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
import { GLOBALE_QUELLEN, analysiereLinknetz } from './lib/stadt-linknetz-scan.mjs'
import { nachbarnMitRueckkanten } from '../claimondo-marketing/lib/kfz-gutachter/nachbar-auswahl.mjs'

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

/** `angrenzendeOrte` je Hub-City — seit P3-A2 werden die Orte MIT eigener
 *  Stadtseite als Link gerendert, sind also echte Kanten. Die Hub-Zuordnung
 *  muss dafuer erhalten bleiben; die erste Fassung sammelte nur die Ortslisten
 *  und konnte daraus keine Kante bilden. */
function parseAngrenzendeOrteJeHub(quelltext) {
  const start = quelltext.indexOf('HYPERLOCAL_DATA')
  if (start < 0) throw new Error('HYPERLOCAL_DATA nicht gefunden')
  const block = quelltext.slice(start)

  const hubs = [...block.matchAll(/^ {2}([a-z][a-z0-9-]*): \{/gm)].map((m) => ({
    slug: m[1],
    idx: m.index,
  }))
  if (!hubs.length) throw new Error('keine Hub-Sektion in HYPERLOCAL_DATA erkannt')

  const ergebnis = []
  for (let i = 0; i < hubs.length; i++) {
    const segment = block.slice(hubs[i].idx, hubs[i + 1]?.idx ?? block.length)
    const treffer = segment.match(/angrenzendeOrte: \[([^\]]*)\]/)
    if (!treffer) continue
    ergebnis.push({
      hub: hubs[i].slug,
      orte: treffer[1]
        .split(',')
        .map((s) => s.trim().replace(/^'|'$/g, ''))
        .filter(Boolean),
    })
  }

  // Reissleine: kommt `angrenzendeOrte` im Block vor, muss es auch zugeordnet
  // werden — sonst faellt der Parser still auf 0 Kanten zurueck.
  const roh = (block.match(/angrenzendeOrte: \[/g) ?? []).length
  if (roh !== ergebnis.length) {
    throw new Error(
      `${roh} angrenzendeOrte-Listen, aber ${ergebnis.length} einem Hub zugeordnet — der Parser passt nicht mehr zur Formatierung von staedte.ts.`,
    )
  }
  return ergebnis
}

/** Die Spoke->Hub-Paare aus `spokeLocal`. Diese Kante WIRD gerendert — als
 *  Inline-Link im Fliesstext der Spoke-Sektion ([stadt]/page.tsx, "spoke_einsatz").
 *  Sie zaehlt deshalb als thematische Kante. Die Gegenrichtung Hub->Spoke fehlt
 *  dagegen komplett; das ist P3-A2. */
function parseSpokeHubPaare(quelltext) {
  const block = staedteBlock(quelltext)
  const paare = []
  // Je Stadt-Eintrag pruefen: der naechste `hubSlug` vor dem naechsten `slug:`
  // gehoert zu dieser Stadt.
  const stadtRe = /slug: '([a-z0-9-]+)',\s*\n\s*name: '/g
  const starts = [...block.matchAll(stadtRe)].map((m) => ({ slug: m[1], idx: m.index }))
  for (let i = 0; i < starts.length; i++) {
    const segment = block.slice(starts[i].idx, starts[i + 1]?.idx ?? block.length)
    const hub = segment.match(/hubSlug: '([a-z0-9-]+)'/)
    if (hub) paare.push({ spoke: starts[i].slug, hub: hub[1] })
  }

  // Reissleine: kommt `hubSlug` im Block vor, muss die Zuordnung auch greifen.
  // Sonst faellt der Parser still auf 0 zurueck und das Skript meldet wieder
  // "keine Spoke->Hub-Kante" — genau der Fehlschluss, den es beim ersten Wurf
  // schon einmal produziert hat.
  const roh = (block.match(/hubSlug: '/g) ?? []).length
  if (roh !== paare.length) {
    throw new Error(
      `${roh} hubSlug-Vorkommen, aber ${paare.length} zugeordnet — der Spoke-Parser passt nicht mehr zur Formatierung von staedte.ts.`,
    )
  }
  return paare
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
  //    Seit der Reziprozitaet ist das `nachbarnMitRueckkanten`, nicht mehr
  //    `waehleNachbarn`: mit der reinen Auswahl meldete der Datenmodus Waisen,
  //    die auf der Seite laengst verlinkt sind (17.08. an bocholt/siegen
  //    aufgefallen). Ein Messwerkzeug, das der Seite hinterherhinkt, erzeugt
  //    Fehlalarme — und beim naechsten Mal glaubt sie niemand mehr.
  for (const s of staedte) {
    for (const ziel of nachbarnMitRueckkanten(s.slug, staedte, 6)) {
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
    kanten.push({ von: 'kfz-gutachter', nach: s.slug, quelle: 'uebersicht', vonIstStadt: false })
  }

  // 4. Spoke -> Hub. Diese Kante existiert bereits als Inline-Link in der
  //    Spoke-Sektion. Sie fehlte im ersten Wurf dieses Skripts, das nur die
  //    DATEN sah und daraus "nicht verlinkt" schloss — derselbe Fehlschluss,
  //    den die P3-Spec §0 anprangert. Am gerenderten HTML nachgeprueft
  //    (solingen verlinkt wuppertal ausserhalb des <footer>).
  const spokeHubs = parseSpokeHubPaare(quelltext)
  for (const { spoke, hub } of spokeHubs) {
    kanten.push({ von: spoke, nach: hub, quelle: 'spoke-hub' })
  }

  // 5. angrenzendeOrte der Hub-Seiten. Seit P3-A2 werden die Orte MIT eigener
  //    Stadtseite als Link gerendert — das sind echte Kanten. Sie standen hier
  //    faelschlich weiter unter "Material" (siehe unten), wodurch der Datenmodus
  //    nach dem A2-Merge unveraenderte Zahlen meldete und der PR beinahe fuer
  //    wirkungslos gehalten wurde.
  const nachName = new Map(staedte.map((s) => [s.name, s.slug]))
  const angrenzendeKanten = []
  for (const { hub, orte } of parseAngrenzendeOrteJeHub(quelltext)) {
    for (const ort of orte) {
      const ziel = nachName.get(ort)
      if (!ziel || ziel === hub) continue
      kanten.push({ von: hub, nach: ziel, quelle: 'angrenzend' })
      angrenzendeKanten.push(`${hub}->${ziel}`)
    }
  }

  return { staedte, kanten, footer, spokeHubs, angrenzendeKanten, quelltext }
}

// ------------------------------------------------------------ Crawl-Modus

/** Trennt den Seiteninhalt vom Footer-Strip.
 *
 *  WARUM am `<footer>`-Element und nicht an CSS-Klassen: Der erste Wurf nahm
 *  "Pill-Klasse = thematisch, alles andere = global" an und verbuchte damit den
 *  Hub-Link der Spoke-Seiten (ein Inline-Link im Fliesstext) faelschlich als
 *  Footer. Die Klassen sind ein Implementierungsdetail, das Element ist die
 *  Struktur. Gegen prod geprueft: bei /kfz-gutachter/solingen steht der
 *  Hub-Link `wuppertal` ausserhalb, die zehn FOOTER_STANDORTE innerhalb. */
function teileAmFooter(html) {
  const i = html.indexOf('<footer')
  return i < 0 ? { inhalt: html, footer: '' } : { inhalt: html.slice(0, i), footer: html.slice(i) }
}

function stadtLinks(html) {
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
    const { inhalt, footer } = teileAmFooter(html)
    if (!footer) fehler.push(`${s.slug}: kein <footer>-Element — Trennung unsicher`)

    for (const ziel of new Set(stadtLinks(inhalt))) {
      if (ratgeber.has(ziel) || ziel === s.slug) continue
      kanten.push({ von: s.slug, nach: ziel, quelle: 'seiteninhalt' })
    }
    for (const ziel of new Set(stadtLinks(footer))) {
      if (ratgeber.has(ziel)) continue
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
    const marke = GLOBALE_QUELLEN.includes(quelle) ? ' (global, zaehlt nicht thematisch)' : ''
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
    const alleOrte = parseAngrenzendeOrteJeHub(r.quelltext).flatMap((x) => x.orte)

    extras.geplant = [
      `angrenzendeOrte: ${alleOrte.length} Ortsnamen auf Hub-Seiten, davon ${r.angrenzendeKanten.length} mit eigener Stadtseite — diese werden verlinkt und zaehlen oben als Kante (Quelle 'angrenzend'); der Rest bleibt bewusst Text, ein Link waere eine 404`,
      ...r.spokeHubs
        .filter((p) => !slugSet.has(p.hub))
        .map((p) => `hubSlug '${p.hub}' (von ${p.spoke}) hat KEINE Stadtseite`),
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
