// Nachraeumen: der erste Cleanup-Lauf lief in drei Spaltenfehler und liess
// CLM-2026-05610 verwaist zurueck (lead_id war da schon SET NULL).
//
// Korrigierte Annahmen:
//   - gutachter_finder_anfragen verweist ueber `konvertiert_zu_lead_id`, nicht `lead_id`
//   - faelle_claim_bridge hat keinen `id`-PK -> ueber claim_id loeschen
//   - fall_dokumente.claim_id ist NOT NULL -> VOR dem Claim weg
import { svc } from './ep-lib.mjs'

const db = svc()
// Claim-ID als Argument — beim ersten Lauf war sie fest verdrahtet, und der zweite
// Durchstich hinterliess dadurch prompt wieder einen verwaisten Claim.
const CLAIM = process.argv[2] || 'bf2f88e2-e8b2-4e22-959e-51939d1933d6'
const REST_LEAD_MUSTER = 'epsweep-%'

const del = async (tabelle, spalte, wert, label) => {
  const q = db.from(tabelle).delete()
  const { data, error } = await (Array.isArray(wert) ? q.in(spalte, wert) : q.eq(spalte, wert)).select()
  if (error) console.log(`  ✖ ${tabelle}: ${error.message}`)
  else console.log(`  ✓ ${tabelle}${label ? ' (' + label + ')' : ''}: ${data?.length ?? 0}`)
  return data?.length ?? 0
}

console.log('— Reste am Claim CLM-2026-05610 —')
for (const t of ['fall_dokumente', 'tasks', 'pflichtdokumente', 'claim_parties', 'auftraege', 'phase_transitions', 'nachrichten', 'partner_provisionen', 'claim_vehicle_involvement']) {
  await del(t, 'claim_id', CLAIM)
}
await del('faelle_claim_bridge', 'claim_id', CLAIM)
await del('claims', 'id', CLAIM)

console.log('\n— Rest-Leads —')
const { data: leads } = await db.from('leads').select('id, email').ilike('email', REST_LEAD_MUSTER)
for (const l of leads ?? []) {
  // Die Anfrage zeigt per konvertiert_zu_lead_id auf den Lead -> zuerst loesen
  const { error: gfaErr } = await db.from('gutachter_finder_anfragen').delete().eq('konvertiert_zu_lead_id', l.id)
  if (gfaErr) console.log(`  ✖ gfa fuer ${l.email}: ${gfaErr.message}`)
  for (const t of ['flow_links', 'nachrichten', 'tasks', 'admin_termine']) await del(t, 'lead_id', l.id)
  await del('leads', 'id', l.id, l.email)
}

console.log('\n— Nachzaehlen (der eigentliche Beweis) —')
const { count: restLeads } = await db.from('leads').select('id', { count: 'exact', head: true }).ilike('email', REST_LEAD_MUSTER)
const { count: restGfa } = await db.from('gutachter_finder_anfragen').select('id', { count: 'exact', head: true }).ilike('vorname', 'Epsweep')
const { data: claim } = await db.from('claims').select('id').eq('id', CLAIM).maybeSingle()
const { data: waisen } = await db.from('claims').select('claim_nummer').is('lead_id', null).gte('created_at', new Date(Date.now() - 5 * 3600_000).toISOString())
console.log('epsweep-Leads:', restLeads, '| epsweep-Anfragen:', restGfa, '| CLM-2026-05610 noch da:', !!claim)
console.log('Verwaiste Claims (5h, auch fremde):', (waisen ?? []).map((c) => c.claim_nummer).join(', ') || 'keine')
