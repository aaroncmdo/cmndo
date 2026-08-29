// Cleanup aller EPSWEEP-Testdaten. Reihenfolge FK-sicher, jeder Delete geprueft.
// ⚠ Claims ZUERST einsammeln (claims.lead_id ist SET NULL) — wer den Lead zuerst loescht,
//   laesst den Claim verwaist zurueck, und das faellt erst beim Nachzaehlen auf.
import { svc, cleanup } from './ep-lib.mjs'

const db = svc()
const trocken = process.argv.includes('--dry')

const { data: leads, error: e1 } = await db.from('leads').select('id, email, vorname, nachname').ilike('email', 'epsweep-%')
if (e1) throw new Error(e1.message)
const { data: gfas, error: e2 } = await db.from('gutachter_finder_anfragen').select('id, vorname, nachname, email, konvertiert_zu_lead_id').ilike('nachname', 'E%')
if (e2) throw new Error(e2.message)
const meineGfas = (gfas ?? []).filter((g) => /^Epsweep$/i.test(g.vorname || ''))

console.log('Leads  :', leads?.length ?? 0, (leads ?? []).map((l) => l.email).join(', '))
console.log('Anfragen:', meineGfas.length, meineGfas.map((g) => `${g.nachname}(${g.id.slice(0, 8)})`).join(', '))

if (trocken) { console.log('\n--dry: nichts geloescht'); process.exit(0) }

let fehlerGesamt = []
for (const l of leads ?? []) {
  const r = await cleanup(db, l.email)
  console.log(`  ${l.email}: ${r.protokoll.join(' ') || '(nichts)'}${r.fehler.length ? ' FEHLER: ' + r.fehler.join('; ') : ''}`)
  fehlerGesamt.push(...r.fehler)
}

// Anfragen ohne Lead-Bezug separat (die Stadtseite legt nur eine gfa an)
if (meineGfas.length) {
  const { data, error } = await db.from('gutachter_finder_anfragen').delete().in('id', meineGfas.map((g) => g.id)).select('id')
  if (error) fehlerGesamt.push(`gfa: ${error.message}`)
  else console.log(`  Anfragen geloescht: ${data?.length ?? 0}`)
}

// ── Nachzaehlen: das ist der eigentliche Beweis, nicht die Delete-Meldung ──
const rest = {}
for (const [t, sp, w] of [
  ['leads', 'email', 'epsweep-%'],
  ['gutachter_finder_anfragen', 'email', 'epsweep-%'],
]) {
  const { count } = await db.from(t).select('id', { count: 'exact', head: true }).ilike(sp, w)
  rest[t] = count ?? 0
}
const { data: waisen } = await db.from('claims')
  .select('id, claim_nummer, created_at')
  .is('lead_id', null)
  .gte('created_at', new Date(Date.now() - 4 * 3600_000).toISOString())
console.log('\nRest:', JSON.stringify(rest))
console.log('Verwaiste Claims (4h):', (waisen ?? []).map((c) => c.claim_nummer).join(', ') || 'keine')
if (fehlerGesamt.length) { console.log('\n⚠ FEHLER:'); fehlerGesamt.forEach((f) => console.log('  ' + f)) }
