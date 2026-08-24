// Baut charge-16-bonn-korrektur.json aus dem exportierten Ist-Stand:
//   - unfallHotspots werden ERSETZT (Opferzahlen raus, Quelle korrigiert)
//   - lokaleFaqs werden ANGEHAENGT
//   - alles andere bleibt unangetastet
//
// ⚠ Das vorhandene merge-lokalinhalte-zusatz.mjs haengt NUR an — die Hotspots
// muessen hier aber ersetzt werden, deshalb ein eigener Schritt. Der
// Schrumpf-Waechter prueft dafuer ALLE Felder, nicht nur die FAQ-Zahl: genau
// die Luecke, die der Rueckschritt-Waechter im Import offen laesst.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HIER = dirname(fileURLToPath(import.meta.url))
const ist = JSON.parse(readFileSync(join(HIER, 'lokalinhalte/.ist-stand-bonn.json'), 'utf8'))
const hotspots = JSON.parse(readFileSync(join(HIER, '.hotspots-bonn-v2.json'), 'utf8'))
const faqs = JSON.parse(readFileSync(join(HIER, '.faqs-bonn-v2.json'), 'utf8'))
const ZIEL = join(HIER, 'lokalinhalte/charge-16-bonn-korrektur.json')

const ziel = {}
let fehler = 0
console.log('Ort              Bezirke  Achsen  Hotspots(alt→neu)  FAQs(alt→neu)  topo')

for (const [slug, basis] of Object.entries(ist)) {
  const neueHotspots = hotspots[slug]
  if (!Array.isArray(neueHotspots) || neueHotspots.length === 0) {
    console.error(`🔴 ${slug}: keine neuen Hotspots — Abbruch statt Feld leeren`)
    fehler++
    continue
  }
  // Dublettenschutz auf der Frage
  const vorhanden = new Set(basis.lokaleFaqs.map((f) => f.frage.trim().toLowerCase()))
  const zusatz = (faqs[slug] ?? []).filter((f) => {
    if (vorhanden.has(f.frage.trim().toLowerCase())) {
      console.error(`🔴 ${slug}: FAQ doppelt — "${f.frage.slice(0, 40)}"`)
      fehler++
      return false
    }
    return true
  })

  const neu = {
    ...basis,
    unfallHotspots: neueHotspots,
    lokaleFaqs: [...basis.lokaleFaqs, ...zusatz],
  }

  // --- Schrumpf-Waechter ueber ALLE Felder ---------------------------------
  const zaehl = (o) => ({
    bezirke: (o.stadtbezirke ?? []).length,
    autobahnen: (o.hauptachsen?.autobahnen ?? []).length,
    bundesstrassen: (o.hauptachsen?.bundesstrassen ?? []).length,
    knoten: (o.hauptachsen?.knoten ?? []).length,
    hotspots: (o.unfallHotspots ?? []).length,
    faqs: (o.lokaleFaqs ?? []).length,
    topo: o.topografieAnker ? 1 : 0,
    hero: o.heroAnker ? 1 : 0,
  })
  const a = zaehl(basis), b = zaehl(neu)
  for (const k of Object.keys(a)) {
    if (b[k] < a[k]) {
      console.error(`🔴 ${slug}: ${k} schrumpft ${a[k]} → ${b[k]}`)
      fehler++
    }
  }
  ziel[slug] = neu
  console.log(
    `  ${slug.padEnd(16)}${String(b.bezirke).padStart(5)}${String(b.autobahnen + b.bundesstrassen + b.knoten).padStart(8)}` +
      `${String(a.hotspots + '→' + b.hotspots).padStart(15)}${String(a.faqs + '→' + b.faqs).padStart(14)}` +
      `${(b.topo ? '  ja' : '  NEIN').padStart(6)}`,
  )
}

if (fehler > 0) {
  console.error(`\n🔴 ${fehler} Befund(e) — nichts geschrieben.`)
  process.exit(1)
}
writeFileSync(ZIEL, JSON.stringify(ziel, null, 2))
const alle = Object.values(ziel).flatMap((s) => s.unfallHotspots)
console.log(`\nGeschrieben: ${ZIEL}`)
console.log(`Hotspots: ${alle.length} · mit Opferzahlen: ${alle.filter((h) => /Schwerverletzt|tödlich|Getötet/i.test(h.beschreibung)).length}`)
console.log(`Quellen auf statistikportal (Kartenanwendung): ${alle.filter((h) => /statistikportal/.test(h.quelle)).length} (muss 0 sein)`)
