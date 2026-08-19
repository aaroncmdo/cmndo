// Deaktiviert VERWAISTE Smoke-Claims auf prod — Claims aus Smokes, deren Aufraeum-Code
// nicht mehr existiert (SMOKE-P4, SMOKE-P4B, SMOKE-UX; 29.07.-01.08.2026).
//
// WARUM DEAKTIVIEREN STATT LOESCHEN: `ist_aktiv=false` + `deaktiviert_grund='testfall'` ist
// das im Repo etablierte Muster (smoke-kundenfunnel-szenarien-prod.spec.ts macht es genauso,
// 26 Claims stehen so da). Es ist reversibel und braucht keine FK-Reihenfolge.
//
// ABGRENZUNG — bewusst NICHT erfasst:
//   * Claims juenger als MIN_ALTER_TAGE: die Seeds von kasko/werkstatt-finder/kanzlei rufen
//     `clean()` bei JEDEM Lauf als Erstes ("frischer Start") und raeumen ihren Rest selbst weg.
//   * SMOKE-C1-QUALI: die Spec raeumt ihren Claim seit dem Fix im afterAll selbst auf.
//   * Claims OHNE SMOKE-Marker: nicht sicher als Testdaten erkennbar -> Finger weg.
//
// Aufruf:
//   node --env-file=.env.local scripts/smoke/verwaiste-smoke-claims-deaktivieren.mjs           # Dry-Run
//   node --env-file=.env.local scripts/smoke/verwaiste-smoke-claims-deaktivieren.mjs --apply   # schreibt
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (--env-file=.env.local?)')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const MIN_ALTER_TAGE = 7
const db = createClient(url, key, { auth: { persistSession: false } })

const grenze = new Date(Date.now() - MIN_ALTER_TAGE * 86400_000).toISOString()

const { data: kandidaten, error: leseFehler } = await db
  .from('claims')
  .select('id, claim_nummer, created_at, schadenort_adresse, operative_status')
  .like('schadenort_adresse', 'SMOKE-%')
  .is('ist_aktiv', true)
  .is('lead_id', null)
  .lt('created_at', grenze)
  .order('created_at')

if (leseFehler) {
  console.error('Lesen fehlgeschlagen:', leseFehler.message)
  process.exit(1)
}

const liste = kandidaten ?? []
console.log(`\n${APPLY ? 'ANWENDEN' : 'DRY-RUN'} — verwaiste Smoke-Claims (SMOKE-Marker, aktiv, ohne Lead, > ${MIN_ALTER_TAGE} Tage alt)\n`)
if (!liste.length) {
  console.log('  keine Kandidaten.\n')
  process.exit(0)
}
for (const c of liste) {
  console.log(`  ${c.claim_nummer}  ${String(c.created_at).slice(0, 10)}  ${c.schadenort_adresse}  [${c.operative_status ?? 'kein Status'}]`)
}
console.log(`\n  => ${liste.length} Claim(s)\n`)

if (!APPLY) {
  console.log('  Nichts geschrieben. Mit --apply ausfuehren.\n')
  process.exit(0)
}

const { data: geaendert, error: schreibFehler } = await db
  .from('claims')
  .update({ ist_aktiv: false, deaktiviert_am: new Date().toISOString(), deaktiviert_grund: 'testfall' })
  .in('id', liste.map((c) => c.id))
  .select('id')

if (schreibFehler) {
  console.error('Deaktivieren fehlgeschlagen:', schreibFehler.message)
  process.exit(1)
}
// Zeilen zaehlen, nicht nur den Fehler pruefen: ein Filter, der 0 Zeilen trifft, meldet keinen Fehler.
console.log(`  ${geaendert?.length ?? 0} von ${liste.length} Claim(s) deaktiviert.\n`)
if ((geaendert?.length ?? 0) !== liste.length) {
  console.error('  ⚠ Abweichung — bitte pruefen.')
  process.exit(1)
}
