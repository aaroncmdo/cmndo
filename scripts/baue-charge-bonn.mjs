// Baut scripts/lokalinhalte/charge-15-bonn-hotspots.json:
//   Bestand aus der DB (Bezirke, Achsen, Topografie, vorhandene FAQs)
// + neue unfallHotspots aus dem amtlichen Unfallatlas (.hotspots-bonn-fertig.json)
// + neue FAQs aus .faqs-bonn-neu.json
//
// Der Bestand wird MITGESCHRIEBEN, nicht ersetzt: Der Import laeuft mit
// --ersetzen (partieller Unique-Index laesst nur EINE veroeffentlichte Zeile je
// Stadt zu), die neue Zeile muss also alles enthalten, was die alte hatte.
//
// Run: node scripts/baue-charge-bonn.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HIER = dirname(fileURLToPath(import.meta.url))
const ZIEL = join(HIER, 'lokalinhalte/charge-15-bonn-hotspots.json')
const SLUGS = ['bonn','sankt-augustin','siegburg','troisdorf','koenigswinter','bad-honnef','hennef','bornheim','rheinbach','meckenheim']

const URL_ = 'https://paizkjajbuxxksdoycev.supabase.co'
const KEY = process.argv[2]
if (!KEY) { console.error('Bitte den anon-Key als Argument uebergeben.'); process.exit(1) }

const hotspots = JSON.parse(readFileSync(join(HIER, '.hotspots-bonn-fertig.json'), 'utf8'))
const faqPfad = join(HIER, '.faqs-bonn-neu.json')
const neueFaqs = existsSync(faqPfad) ? JSON.parse(readFileSync(faqPfad, 'utf8')) : {}
if (!existsSync(faqPfad)) console.log('ℹ .faqs-bonn-neu.json fehlt — Charge entsteht ohne neue FAQs\n')

const r = await fetch(
  `${URL_}/rest/v1/stadt_lokalinhalte?status=eq.veroeffentlicht&stadt_slug=in.(${SLUGS.join(',')})` +
    `&select=stadt_slug,stadtbezirke,hauptachsen,lokale_faqs,topografie_anker,hero_anker`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
)
if (!r.ok) { console.error('DB-Abruf fehlgeschlagen:', r.status, await r.text()); process.exit(1) }
const rows = new Map((await r.json()).map((z) => [z.stadt_slug, z]))
console.log(`Bestand geladen: ${rows.size}/${SLUGS.length} Staedte`)

const charge = {}
for (const slug of SLUGS) {
  const b = rows.get(slug)
  if (!b) { console.error(`🔴 ${slug}: kein Bestand in der DB`); process.exit(1) }

  const bestandFaqs = (b.lokale_faqs ?? []).map((f) => ({ frage: f.frage, antwort: f.antwort }))
  const zusatz = (neueFaqs[slug] ?? []).map((f) => ({ frage: f.frage, antwort: f.antwort }))

  charge[slug] = {
    stadtbezirke: b.stadtbezirke ?? [],
    hauptachsen: b.hauptachsen ?? { autobahnen: [], bundesstrassen: [], knoten: [] },
    unfallHotspots: hotspots[slug] ?? [],
    lokaleFaqs: [...bestandFaqs, ...zusatz],
    ...(b.topografie_anker ? { topografieAnker: b.topografie_anker } : {}),
    ...(b.hero_anker ? { heroAnker: b.hero_anker } : {}),
  }
}

writeFileSync(ZIEL, JSON.stringify(charge, null, 2))
console.log(`\nGeschrieben: ${ZIEL}\n`)
console.log('Ort              Bezirke  Hotspots  FAQs (Bestand+neu)')
for (const slug of SLUGS) {
  const c = charge[slug]
  const alt = (rows.get(slug).lokale_faqs ?? []).length
  console.log(
    `  ${slug.padEnd(16)}${String(c.stadtbezirke.length).padStart(5)}` +
      `${String(c.unfallHotspots.length).padStart(9)}` +
      `${String(c.lokaleFaqs.length).padStart(8)} (${alt}+${c.lokaleFaqs.length - alt})`,
  )
}
