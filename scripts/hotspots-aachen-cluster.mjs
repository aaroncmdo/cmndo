// Uebertraegt die amtlichen Unfallhaeufungen des Unfallatlas in eine Chargendatei
// fuer die Aachen-Domain — aus der bereits im Repo liegenden, geteilten Datei
// claimondo-marketing/lib/kfz-gutachter/stadt-unfallhotspots.json (PR #5483).
//
// WARUM AUS DER DATEI und nicht aus dem Rohdatensatz: Die Auswertung existiert
// schon fuer 162 Staedte. Sie erneut zu fahren wuerde dieselben Zahlen erzeugen,
// aber Geocoding kosten und die geteilte Datei anfassen — beides ohne Nutzen.
//
// ⚠ ZWEI REDAKTIONSREGELN, die den Satz bestimmen:
//   1. `kfz-gutachter-aachen/lib/lokaldaten.ts` Z.3: "keine Todesfaelle/
//      Verletztenzahlen auf der LP". Deshalb wird NUR der Basissatz von
//      `unfallhotspots.ts:hotspotSatz` uebernommen; dessen optionale Zusaetze
//      zu Getoeteten und Schwerverletzten bleiben weg.
//   2. Der Unfallatlas erfasst NUR Unfaelle MIT PERSONENSCHADEN. "N Unfaelle"
//      ohne diesen Zusatz waere zu hoch gegriffen, weil reine Sachschaeden gar
//      nicht enthalten sind. Der Zusatz ist keine Opferzahl, sondern die
//      Qualifikation der Zahl — er MUSS stehen bleiben.
//
// ⚠ QUELL-URL BLANK: `LokalinhaltSection.tsx` nimmt das GANZE `quelle`-Feld als
// href. Ein Zusatz in Klammern — wie ihn scripts/hotspots-bonn-cluster.mjs
// anhaengt — erzeugt einen kaputten Link. Die Zuschreibung gehoert deshalb in
// den Beschreibungstext, nicht hinter die URL.
//
// Run: node scripts/hotspots-aachen-cluster.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HIER = dirname(fileURLToPath(import.meta.url))
const REPO = join(HIER, '..')

const IST = join(HIER, 'lokalinhalte', '.ist-stand-aachen-cluster.json')
const ATLAS = join(REPO, 'claimondo-marketing', 'lib', 'kfz-gutachter', 'stadt-unfallhotspots.json')
const ZIEL = join(HIER, 'lokalinhalte', 'charge-22-aachen-cluster-unfallatlas.json')

const QUELLE = 'https://unfallatlas.statistikportal.de/'
const HERKUNFT =
  'Grundlage ist der Unfallatlas der Statistischen Ämter des Bundes und der Länder (Datenlizenz Deutschland 2.0).'

/** Ein Satz je Ort, der erklaert, WAS die Zahl an dieser Stelle bedeutet.
 *  Bewusst je Stadt formuliert — sonst steht auf neun Seiten derselbe Zusatz. */
const KONTEXT = {
  aachen:
    'Reine Blechschäden zählt der Atlas nicht mit — die Zahl der Zusammenstöße an dieser Stelle liegt also höher.',
  dueren:
    'Parkrempler und reine Sachschäden bleiben außen vor; die tatsächliche Zahl der Zusammenstöße liegt darüber.',
  alsdorf:
    'Die in den engen Alsdorfer Wohnquartieren häufigen reinen Streifschäden sind darin nicht enthalten.',
  wuerselen:
    'Blechschäden im ruhenden Verkehr sind nicht mitgezählt, die Stelle ist also stärker belastet als die Zahl vermuten lässt.',
  eschweiler:
    'Reine Sachschäden tauchen in dieser Statistik nicht auf.',
  'stolberg-rheinland':
    'Die für Stolberg typischen Bordstein- und Felgenschäden bleiben unberücksichtigt.',
  herzogenrath:
    'Parkrempler und reine Blechschäden bleiben außen vor.',
}

const ist = JSON.parse(readFileSync(IST, 'utf8'))
const atlas = JSON.parse(readFileSync(ATLAS, 'utf8'))

const ausgabe = {}
let uebertragen = 0
const zeilen = []

for (const [slug, basis] of Object.entries(ist)) {
  const quelle = atlas[slug]
  const neue = []

  if (quelle) {
    const zeitraum = quelle.zeitraum
    for (const h of quelle.hotspots) {
      const ort =
        h.stadtteil && h.stadtteil !== h.strasse ? `${h.strasse} (${h.stadtteil})` : h.strasse
      // NUR der Basissatz aus hotspotSatz — ohne die Zusaetze zu Getoeteten
      // und Schwerverletzten (Redaktionsregel 1).
      const basissatz = `${zeitraum} wurden hier ${h.unfaelle} Unfälle mit Personenschaden erfasst.`
      neue.push({
        ort,
        beschreibung: `${basissatz} ${HERKUNFT} ${KONTEXT[slug]}`,
        quelle: QUELLE,
        einzelfall: false,
      })
      uebertragen++
    }
  }

  // Orte ohne Atlas-Daten kommen gar nicht erst in die Charge: Sie haetten
  // nichts zu aendern, und `juelich`/`baesweiler` fehlen zusaetzlich in
  // staedte.ts — der Import wuerde sie ohnehin wortlos ueberspringen und dabei
  // als "abgelehnt" zaehlen, was den Lauf unnoetig mehrdeutig macht.
  if (neue.length === 0) {
    zeilen.push(`  ${slug.padEnd(20)} keine Unfallatlas-Daten — nicht in der Charge`)
    continue
  }

  // Bestehende Eintraege bleiben vorn (Aachen: die 6 der Unfallkommission).
  ausgabe[slug] = { ...basis, unfallHotspots: [...basis.unfallHotspots, ...neue] }
  zeilen.push(
    `  ${slug.padEnd(20)} ${String(basis.unfallHotspots.length).padStart(2)} bestehend + ${String(neue.length).padStart(2)} Unfallatlas = ${String(ausgabe[slug].unfallHotspots.length).padStart(2)}   FAQs ${basis.lokaleFaqs.length}`,
  )
}

writeFileSync(ZIEL, JSON.stringify(ausgabe, null, 2) + '\n')
console.log(`\nGeschrieben: ${ZIEL}\n`)
for (const z of zeilen) console.log(z)
console.log(`\n${uebertragen} amtliche Haeufungen uebertragen.`)

// Selbstpruefung: keine Opferzahl-Woerter, keine URL mit Zusatz.
const roh = JSON.stringify(ausgabe)
const opfer = roh.match(/verletzt|getötet|tödlich|starb|verstorben/gi) ?? []
const urlsMitZusatz = Object.values(ausgabe)
  .flatMap((s) => s.unfallHotspots)
  .filter((h) => /\s/.test(h.quelle))
console.log(`Opferzahl-Woerter: ${opfer.length} · Quell-URLs mit Zusatz: ${urlsMitZusatz.length}`)
if (opfer.length || urlsMitZusatz.length) {
  console.error('🔴 Redaktionsregel verletzt — nicht importieren.')
  process.exitCode = 1
}
