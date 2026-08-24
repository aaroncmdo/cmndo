// Fuehrt nachgelieferte FAQs mit dem Bestand zusammen — zu EINER importierbaren Charge.
//
// WOFUER: Die Nachbesserung liefert nur `lokaleFaqs`. Bezirke, Achsen und Anker
// stehen bereits in der Datenbank und sollen unveraendert bleiben. Dieses Skript
// holt den Bestand, wirft die vor-Ort-Schablone raus, haengt die neuen FAQs an
// und schreibt eine Datei, die der normale Import verarbeiten kann.
//
// ⚠ Die `_`-Felder der Nachbesserungs-Dateien sind LESESTOFF fuer die Agenten
// (vorhandene Bezirke, Achsen, Topografie) — sie duerfen NICHT in die Datenbank.
//
// Run: npx tsx scripts/merge-nachbesserung.mts [--ziel <datei>]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

for (const p of ['.env.local', 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local']) {
  if (!existsSync(p)) continue
  for (const z of readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const t = z.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  break
}

const zi = process.argv.indexOf('--ziel')
const ZIEL = zi > -1 ? process.argv[zi + 1] : 'scripts/lokalinhalte/charge-11-nachbesserung.json'
const ORDNER = 'scripts/lokalinhalte'

const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const dateien = readdirSync(ORDNER).filter((f) => f.startsWith('.nachbesserung-') && f.endsWith('.json'))
if (dateien.length === 0) {
  // Eine leere Menge ist ein Befund, kein Ruhezustand.
  console.error('🔴 KEINE .nachbesserung-*.json gefunden — nichts zusammengefuehrt.')
  process.exit(1)
}

/** Die Schablone, die dieser Lauf ersetzt. */
const istSchablone = (f: any) =>
  /wie schnell|wie lange dauert/i.test(String(f?.frage ?? '')) &&
  /\d+\s*bis\s*\d+\s*Stunden/i.test(String(f?.antwort ?? ''))

const neueFaqs = new Map<string, any[]>()
let ohneLieferung: string[] = []
for (const f of dateien) {
  const d = JSON.parse(readFileSync(join(ORDNER, f), 'utf8'))
  for (const [slug, s] of Object.entries<any>(d)) {
    const liste = Array.isArray(s?.lokaleFaqs) ? s.lokaleFaqs : []
    if (liste.length === 0) ohneLieferung.push(slug)
    neueFaqs.set(slug, liste)
  }
}

const { data, error } = await sb
  .from('stadt_lokalinhalte')
  .select('stadt_slug, stadtbezirke, hauptachsen, unfall_hotspots, lokale_faqs, hero_anker, topografie_anker')
  .eq('status', 'veroeffentlicht')
  .in('stadt_slug', [...neueFaqs.keys()])
if (error) {
  console.error('DB:', error.message)
  process.exit(1)
}
if ((data?.length ?? 0) !== neueFaqs.size) {
  console.error(`🔴 ${data?.length} DB-Zeilen fuer ${neueFaqs.size} Staedte — Abgleich stimmt nicht.`)
  process.exit(1)
}

const raus: Record<string, any> = {}
let behalten = 0
let ergaenzt = 0
let entfernt = 0
for (const z of data!) {
  const alt = Array.isArray(z.lokale_faqs) ? (z.lokale_faqs as any[]) : []
  const bleibt = alt.filter((f) => !istSchablone(f))
  entfernt += alt.length - bleibt.length
  const neu = neueFaqs.get(z.stadt_slug) ?? []
  behalten += bleibt.length
  ergaenzt += neu.length
  raus[z.stadt_slug] = {
    stadtbezirke: z.stadtbezirke,
    hauptachsen: z.hauptachsen,
    unfallHotspots: z.unfall_hotspots ?? [],
    lokaleFaqs: [...bleibt, ...neu],
    heroAnker: z.hero_anker ?? undefined,
    topografieAnker: z.topografie_anker ?? undefined,
  }
}

writeFileSync(ZIEL, JSON.stringify(raus, null, 2) + '\n', 'utf8')
console.log(`\n${Object.keys(raus).length} Staedte → ${ZIEL}`)
console.log(`  Schablone entfernt   ${entfernt}`)
console.log(`  bestehende behalten  ${behalten}`)
console.log(`  neu ergaenzt         ${ergaenzt}`)
console.log(`  FAQs danach gesamt   ${behalten + ergaenzt}`)
if (ohneLieferung.length) {
  console.log(`\n⚠ OHNE neue FAQs geliefert (${ohneLieferung.length}): ${ohneLieferung.join(', ')}`)
  console.log('  Diese Staedte verlieren die Schablone ersatzlos — pruefen, ob das gewollt ist.')
}
console.log(`\nWeiter:  node --experimental-strip-types scripts/pruefe-charge.mjs ${ZIEL.split(/[\\/]/).pop()!.replace('.json', '')}`)
