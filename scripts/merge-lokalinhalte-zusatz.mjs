// Legt Ergaenzungen auf den exportierten Ist-Stand und schreibt die Chargendatei.
//
// WARUM ALS SKRIPT und nicht von Hand: `import-lokalinhalte.mjs --ersetzen`
// ueberschreibt die Zeile VOLLSTAENDIG, und sein Rueckschritt-Waechter vergleicht
// NUR die Anzahl der lokale_faqs. Verlorene stadtbezirke, hauptachsen oder
// topografie_anker faellt er nicht — die waeren still weg. Hier wird deshalb
// ausschliesslich ANGEHAENGT, und danach gegengezaehlt.
//
// LAUF: node scripts/merge-lokalinhalte-zusatz.mjs <ist-stand.json> <zusatz.json> <ziel.json>

import { readFileSync, writeFileSync } from 'node:fs'

const [istPfad, zusatzPfad, zielPfad] = process.argv.slice(2)
if (!istPfad || !zusatzPfad || !zielPfad) {
  console.error('Aufruf: node scripts/merge-lokalinhalte-zusatz.mjs <ist> <zusatz> <ziel>')
  process.exit(1)
}

const ist = JSON.parse(readFileSync(istPfad, 'utf8'))
const zusatz = JSON.parse(readFileSync(zusatzPfad, 'utf8'))

const ziel = {}
let fehler = 0

for (const [slug, basis] of Object.entries(ist)) {
  const z = zusatz[slug]
  // Ohne Ergaenzung: Stadt gar nicht in die Charge aufnehmen. Eine Zeile, die
  // sich nicht aendert, soll der Import auch nicht anfassen.
  if (!z) continue

  const neueFaqs = Array.isArray(z.lokaleFaqs) ? z.lokaleFaqs : []
  const neueHotspots = Array.isArray(z.unfallHotspots) ? z.unfallHotspots : []

  // Dublettenschutz ueber die Frage — eine versehentlich doppelte FAQ waere
  // auf der Seite sichtbar und im Duplicate-Mass schaedlich.
  const vorhandeneFragen = new Set(basis.lokaleFaqs.map((f) => f.frage.trim().toLowerCase()))
  for (const f of neueFaqs) {
    if (vorhandeneFragen.has(f.frage.trim().toLowerCase())) {
      console.error(`🔴 ${slug}: FAQ doppelt — "${f.frage.slice(0, 50)}"`)
      fehler++
    }
  }

  ziel[slug] = {
    ...basis,
    unfallHotspots: [...basis.unfallHotspots, ...neueHotspots],
    lokaleFaqs: [...basis.lokaleFaqs, ...neueFaqs],
  }

  // Gegenzaehlen: nichts darf kleiner werden.
  const v = ziel[slug]
  if (
    v.stadtbezirke.length !== basis.stadtbezirke.length ||
    v.lokaleFaqs.length < basis.lokaleFaqs.length ||
    v.unfallHotspots.length < basis.unfallHotspots.length ||
    (basis.topografieAnker && v.topografieAnker !== basis.topografieAnker)
  ) {
    console.error(`🔴 ${slug}: Merge haette Inhalt verloren — abgebrochen`)
    fehler++
  }
}

if (fehler > 0) {
  console.error(`\n${fehler} Befund(e) — nichts geschrieben.`)
  process.exit(1)
}

writeFileSync(zielPfad, JSON.stringify(ziel, null, 2) + '\n', 'utf8')

console.log(`\n${zielPfad}\n`)
console.log('Stadt              Bezirke  Achsen  Hotspots      FAQs')
console.log('─'.repeat(62))
for (const [slug, v] of Object.entries(ziel)) {
  const a =
    (v.hauptachsen.autobahnen ?? []).length +
    (v.hauptachsen.bundesstrassen ?? []).length +
    (v.hauptachsen.knoten ?? []).length
  const vorherFaq = ist[slug].lokaleFaqs.length
  const vorherHot = ist[slug].unfallHotspots.length
  console.log(
    slug.padEnd(19) +
      String(v.stadtbezirke.length).padStart(6) +
      String(a).padStart(8) +
      `${String(vorherHot)} → ${v.unfallHotspots.length}`.padStart(11) +
      `${String(vorherFaq)} → ${v.lokaleFaqs.length}`.padStart(11),
  )
}
