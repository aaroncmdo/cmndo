// Wendet die recherchierte Achsen-Korrektur auf DB UND Charge-Dateien an.
//
// WOFUER: Rund die Haelfte der 173 Staedte trug mindestens einen erfundenen oder
// fehlplatzierten Autobahnknoten („Kreuz Trier" gibt es nicht, „Dreieck Nahetal"
// liegt bei Bingen, „Kreuz Hilden" liegt in Hilden). Sieben Subagenten haben alle
// 656 Knoten nachgeschlagen; diese Datei fuehrt ihr Urteil aus.
//
// ⚠ BEIDE SEITEN. Die Datenbank allein reicht nicht — die Charge-Dateien sind die
// Quelle fuer jeden Reimport und wuerden die Fehler zurueckholen. Beim ersten
// Anlauf einer solchen Korrektur fiel das nur auf, weil git „nothing to commit"
// meldete.
//
// Run: npx tsx scripts/wende-knoten-korrektur.mts [--scharf]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'

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

const scharf = process.argv.includes('--scharf')
const li = process.argv.indexOf('--liste')
const LISTE = li > -1 ? process.argv[li + 1] : 'scripts/lokalinhalte/.knoten-korrektur.json'
const KORR = JSON.parse(readFileSync(LISTE, 'utf8'))
console.log(`Liste: ${LISTE}\n`)

/** Wendet die Korrektur einer Stadt auf ein hauptachsen-Objekt an. */
function korrigiere(ha: any, k: any) {
  const weg = new Set(k.knoten_weg ?? [])
  const um: Record<string, string> = k.knoten_um ?? {}
  const abWeg = new Set(k.autobahnen_weg ?? [])
  const abUm: Record<string, string> = k.autobahnen_um ?? {}
  const bsWeg = new Set(k.bundesstrassen_weg ?? [])
  // ⚠ `bundesstrassen_um` kam erst mit der zweiten Liste dazu. Der Anlass:
  // Muenchen fuehrte „B11 (Ingolstaedter Strasse …)" — die Strasse gehoert zur
  // B13, die B11 selbst fuehrt aber durch Muenchen. Nur die Klammer war falsch.
  // Ohne Umbenennung haette man eine RICHTIGE Bundesstrasse loeschen muessen,
  // um eine falsche Klammer loszuwerden.
  const bsUm: Record<string, string> = k.bundesstrassen_um ?? {}
  return {
    ...ha,
    autobahnen: (ha?.autobahnen ?? []).filter((x: string) => !abWeg.has(x)).map((x: string) => abUm[x] ?? x),
    bundesstrassen: (ha?.bundesstrassen ?? []).filter((x: string) => !bsWeg.has(x)).map((x: string) => bsUm[x] ?? x),
    knoten: (ha?.knoten ?? []).filter((x: string) => !weg.has(x)).map((x: string) => um[x] ?? x),
  }
}

// --- Datenbank --------------------------------------------------------------
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const { data, error } = await sb
  .from('stadt_lokalinhalte')
  .select('id, stadt_slug, hauptachsen')
  .eq('status', 'veroeffentlicht')
  .in('stadt_slug', Object.keys(KORR))
if (error) {
  console.error('DB:', error.message)
  process.exit(1)
}
if ((data?.length ?? 0) !== Object.keys(KORR).length) {
  console.error(`🔴 ${data?.length} DB-Zeilen fuer ${Object.keys(KORR).length} Staedte — Abgleich stimmt nicht.`)
  process.exit(1)
}

let dbGeaendert = 0
let leerGelaufen: string[] = []
let nichtGefunden: string[] = []
for (const z of data!) {
  const k = KORR[z.stadt_slug]
  const ha = z.hauptachsen as any
  // ⚠ Vor dem Schreiben pruefen, dass jeder zu entfernende/umzubenennende
  // Eintrag ueberhaupt existiert. Ein Tippfehler in der Korrekturliste wuerde
  // sonst still nichts tun — und der Lauf saehe erfolgreich aus.
  for (const x of [...(k.knoten_weg ?? []), ...Object.keys(k.knoten_um ?? {})]) {
    if (!(ha?.knoten ?? []).includes(x)) nichtGefunden.push(`${z.stadt_slug}: „${x}"`)
  }
  const neu = korrigiere(ha, k)
  if (JSON.stringify(neu) === JSON.stringify(ha)) continue
  dbGeaendert++
  if (neu.knoten.length === 0) leerGelaufen.push(z.stadt_slug)
  if (!scharf) continue
  const { data: d2, error: e2 } = await sb
    .from('stadt_lokalinhalte')
    .update({ hauptachsen: neu })
    .eq('id', z.id)
    .select('id')
  if (e2 || !d2?.length) {
    console.log(`  🔴 ${z.stadt_slug}: ${e2?.message ?? '0 Zeilen geaendert'}`)
    process.exitCode = 1
  }
}

// --- Charge-Dateien ---------------------------------------------------------
let dateiGeaendert = 0
for (const f of readdirSync('scripts/lokalinhalte').filter((x) => x.startsWith('charge-') && x.endsWith('.json'))) {
  const p = 'scripts/lokalinhalte/' + f
  const d = JSON.parse(readFileSync(p, 'utf8'))
  let n = 0
  for (const [slug, s] of Object.entries<any>(d)) {
    const k = KORR[slug]
    if (!k || !s?.hauptachsen) continue
    const neu = korrigiere(s.hauptachsen, k)
    if (JSON.stringify(neu) === JSON.stringify(s.hauptachsen)) continue
    s.hauptachsen = neu
    n++
  }
  if (!n) continue
  dateiGeaendert += n
  console.log(`  ${f.padEnd(34)} ${n} Staedte`)
  if (scharf) writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8')
}

console.log(`\nDB ${dbGeaendert} Staedte · Dateien ${dateiGeaendert} Eintraege`)
if (leerGelaufen.length) {
  console.log(`\n⚠ Knotenliste jetzt LEER (${leerGelaufen.length}): ${leerGelaufen.join(', ')}`)
  console.log('  Erwartet bei Staedten, deren Knoten saemtlich in Nachbarorten liegen.')
}
if (nichtGefunden.length) {
  console.log(`\n🔴 IN DER QUELLE NICHT GEFUNDEN (${nichtGefunden.length}) — Korrekturliste passt nicht zum Bestand:`)
  for (const x of nichtGefunden.slice(0, 20)) console.log('  ' + x)
  process.exitCode = 1
}
console.log(scharf ? '\n✓ geschrieben' : '\nTrockenlauf — mit --scharf schreiben.')
