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
//   node scripts/check-stadt-linknetz.mjs --crawl https://claimondo.de \
//     --staedte /pfad/zu/staedte.ts                    # Crawl gegen einen FREMDEN Stand
//
// WOFUER --staedte: Bei Regel-4-Nachweisen laeuft prod dem Arbeitsbaum immer
// hinterher — staging traegt schon die naechste Welle, prod noch nicht. Ohne den
// Schalter meldet der Crawl jede noch nicht deployte Stadt als 404 UND als
// Waise, und der Bericht steckt voller Fehlalarme, in denen ein echter Befund
// untergeht. Mit ihm crawlt man gegen genau den Stand, der online ist:
//   git show origin/main:claimondo-marketing/lib/kfz-gutachter/staedte.ts > /tmp/prod-staedte.ts
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
import { GLOBALE_QUELLEN, analysiereLinknetz, teileAmSeitenFooter } from './lib/stadt-linknetz-scan.mjs'
import { nachbarnMitRueckkanten } from '../claimondo-marketing/lib/kfz-gutachter/nachbar-auswahl.mjs'
import {
  RATGEBER_SEITEN,
  waehleRatgeberStaedte,
} from '../claimondo-marketing/lib/kfz-gutachter/ratgeber-auswahl.mjs'

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

/** Muss dem Wert in RatgeberStaedteSection.tsx entsprechen — sonst rechnet der
 *  Datenmodus mit einer anderen Menge als die Seite rendert. Eine Abweichung
 *  faellt sofort auf, weil Datenmodus und Crawl dann verschiedene Kantenzahlen
 *  melden. */
const RATGEBER_STAEDTE_JE_SEITE = 8

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

  // 6. Ratgeber-Geschwister -> Staedte (P3-A4). DIESELBE Funktion, die die
  //    Sektion rendert. Sie hier nachzubauen waere der Fehler, der in dieser
  //    Lane schon zweimal passiert ist: ein Datenmodus, der die Regel
  //    nachrechnet statt sie zu benutzen, meldet nach der naechsten Aenderung
  //    andere Zahlen als der Crawl — und dann glaubt man dem falschen Lauf.
  for (const seite of RATGEBER_SEITEN) {
    for (const ziel of waehleRatgeberStaedte(seite, staedte, RATGEBER_STAEDTE_JE_SEITE)) {
      kanten.push({ von: `ratgeber:${seite}`, nach: ziel.slug, quelle: 'ratgeber', vonIstStadt: false })
    }
  }

  return { staedte, kanten, footer, spokeHubs, angrenzendeKanten, quelltext }
}

// ------------------------------------------------------------ Crawl-Modus

function stadtLinks(html) {
  return [...html.matchAll(/href="\/kfz-gutachter\/([a-z0-9-]+)"/g)].map((m) => m[1])
}

/** Eine Seite abrufen. Fehler landen als Text in `fehler`, nicht als Abbruch —
 *  ein 404 auf einer Seite ist ein Befund, kein Grund, den Lauf zu beenden. */
async function hole(url, kennung, fehler) {
  try {
    const antwort = await fetch(url)
    if (!antwort.ok) {
      fehler.push(`${kennung}: HTTP ${antwort.status}`)
      return null
    }
    return await antwort.text()
  } catch (err) {
    fehler.push(`${kennung}: ${err.message}`)
    return null
  }
}

async function sammleAusCrawl(basisUrl, staedteQuelle = STAEDTE_TS) {
  const quelltext = readFileSync(staedteQuelle, 'utf8')
  const staedte = parseStaedte(quelltext)
  const ratgeber = new Set(nichtStadtRouten())
  const standorte = parseFooterStandorte(readFileSync(FOOTER_TSX, 'utf8'))
  const kanten = []
  const fehler = []
  const basis = basisUrl.replace(/\/$/, '')

  for (const s of staedte) {
    const html = await hole(`${basis}/kfz-gutachter/${s.slug}`, s.slug, fehler)
    if (html === null) continue

    const { inhalt, footer, unsicher } = teileAmSeitenFooter(html, standorte)
    if (unsicher) fehler.push(`${s.slug}: ${unsicher}`)

    for (const ziel of new Set(stadtLinks(inhalt))) {
      if (ratgeber.has(ziel) || ziel === s.slug) continue
      kanten.push({ von: s.slug, nach: ziel, quelle: 'seiteninhalt' })
    }
    for (const ziel of new Set(stadtLinks(footer))) {
      if (ratgeber.has(ziel)) continue
      kanten.push({ von: s.slug, nach: ziel, quelle: 'footer' })
    }
  }

  // Die Ratgeber-Geschwister. Sie waren bis 18.08.2026 nur ein FILTER (damit
  // ihre Slugs nicht als tote Stadt-Links zaehlen) — abgerufen wurden sie nie.
  // Seit P3-A4 verlinken sie je acht Staedte, und dieser Lauf sah davon nichts:
  // wer die Sektion entfernt haette, waere durch jede Messung gekommen.
  for (const slug of ratgeber) {
    const html = await hole(`${basis}/kfz-gutachter/${slug}`, `ratgeber/${slug}`, fehler)
    if (html === null) continue

    const { inhalt, unsicher } = teileAmSeitenFooter(html, standorte)
    if (unsicher) fehler.push(`ratgeber/${slug}: ${unsicher}`)

    for (const ziel of new Set(stadtLinks(inhalt))) {
      if (ratgeber.has(ziel)) continue
      // `vonIstStadt: false` haelt die Kante aus der Reziprozitaets-Rechnung:
      // eine Stadtseite kann nicht sinnvoll "zurueck" auf einen Ratgeber
      // verweisen — das taete nur die Navigation, und die ist ueberall gleich.
      kanten.push({ von: `ratgeber:${slug}`, nach: ziel, quelle: 'ratgeber', vonIstStadt: false })
    }
  }

  return { staedte, kanten, fehler, ratgeber: [...ratgeber] }
}

// ---------------------------------------------------------------- Bericht

function zeile(titel, wert) {
  console.log(`  ${titel.padEnd(34)} ${wert}`)
}

function berichte(ergebnis, extras, nurStadtNetz) {
  const { kennzahl } = ergebnis
  console.log('\nSTADT-LINKNETZ\n')
  zeile('Stadtseiten', kennzahl.staedte)
  zeile('thematische Kanten', kennzahl.thematischeKanten)
  zeile(
    'eingehend je Stadt (min/Ø/max)',
    `${kennzahl.eingehendMin} / ${kennzahl.eingehendSchnitt.toFixed(1)} / ${kennzahl.eingehendMax}`,
  )
  if (nurStadtNetz) {
    // Ohne diese zweite Zeile verwaessert die erste: eine Stadt ohne JEDEN
    // Stadt-Nachbarn, die zufaellig auf einer Ratgeber-Seite auftaucht, waere
    // oben keine Waise mehr — obwohl im Stadt-Netz genau dort ein Loch ist.
    // Die Ratgeber-Kanten sind ein Zugewinn, aber sie ersetzen die Nachbarschaft
    // nicht, und die Kennzahl soll nicht so tun.
    const n = nurStadtNetz.kennzahl
    zeile(
      '  davon nur von Stadtseiten',
      `${n.eingehendMin} / ${n.eingehendSchnitt.toFixed(1)} / ${n.eingehendMax}`,
    )
  }
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
  if (nurStadtNetz) {
    // Der eigentliche Ertrag von A4 in einer Zahl: Staedte, die OHNE die
    // Ratgeber-Verweise von keiner anderen Stadtseite erreichbar waeren.
    // Steht hier 0, sind die Ratgeber-Kanten reiner SEO-Zugewinn; steht hier
    // mehr als 0, verdecken sie ein Loch im Nachbarschaftsnetz.
    zeile('nur ueber Ratgeber erreichbar', nurStadtNetz.waisen.length)
    for (const w of nurStadtNetz.waisen.slice(0, 20)) console.log(`     ${w}`)
  }

  if (extras?.nichtErfasst?.length) {
    // Ohne diesen Abschnitt liest sich "0 tote Links" wie eine Vollpruefung.
    console.log('\nNICHT ERFASST (dieser Lauf sieht diese Kanten nicht)\n')
    for (const z of extras.nichtErfasst) console.log(`  - ${z}`)
  }
  if (extras?.geplant?.length) {
    // Hiess bis 17.08.2026 "Material fuer P3-A2" — A2 ist gebaut, die Orte MIT
    // eigener Seite werden laengst verlinkt. Der Abschnitt zeigt jetzt, was
    // bewusst Text bleibt, und wie gross dieser Rest noch ist.
    console.log('\nORTSNAMEN OHNE EIGENE SEITE (bleiben bewusst Text)\n')
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
  const staedteIndex = process.argv.indexOf('--staedte')
  const staedteQuelle = staedteIndex >= 0 ? process.argv[staedteIndex + 1] : null

  if (crawlIndex >= 0 && !basisUrl) {
    console.error('FEHLER: --crawl braucht eine Basis-URL, z.B. --crawl https://claimondo.de')
    process.exit(1)
  }
  if (staedteIndex >= 0 && !staedteQuelle) {
    console.error('FEHLER: --staedte braucht einen Pfad auf eine staedte.ts')
    process.exit(1)
  }
  if (staedteQuelle && !basisUrl) {
    console.error('FEHLER: --staedte ergibt nur zusammen mit --crawl Sinn.')
    process.exit(1)
  }

  let staedte
  let kanten
  const extras = {}

  if (basisUrl) {
    console.log(`crawle ${basisUrl} …`)
    if (staedteQuelle) console.log(`Staedteliste aus ${staedteQuelle}`)
    const r = await sammleAusCrawl(basisUrl, staedteQuelle ?? STAEDTE_TS)
    staedte = r.staedte
    kanten = r.kanten
    extras.fehler = r.fehler
    extras.nichtErfasst = [
      // Zahl aus dem Lauf, nicht aus dem Quelltext: hier stand fest "92", waehrend
      // die Kennzahl darueber schon 150 meldete. Ein Bericht, der sich selbst
      // widerspricht, ist schlimmer als einer ohne die Zahl.
      `Links von der Startseite und /schadensreport-2026 — abgerufen werden die ${r.staedte.length} Stadtseiten und die ${r.ratgeber.length} Ratgeber-Geschwister`,
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

  const slugs = staedte.map((s) => s.slug)
  const ergebnis = analysiereLinknetz({ slugs, kanten, minEingehend: MIN_EINGEHEND })

  // Zweite Sicht OHNE die Ratgeber-Kanten. Beide Zahlen sind wahr und messen
  // Verschiedenes: "erreichbar ueberhaupt" und "im Nachbarschaftsnetz drin".
  // Nur die erste zu zeigen hiesse, ein Loch im Netz mit einem Ratgeber-Link
  // zustopfen zu koennen.
  const nurStadtNetz = analysiereLinknetz({
    slugs,
    kanten: kanten.filter((k) => k.quelle !== 'ratgeber'),
    minEingehend: MIN_EINGEHEND,
  })

  berichte(ergebnis, extras, nurStadtNetz)

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
