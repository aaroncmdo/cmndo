// Raeumt die Leads des Skizzen-Smokes (Kennzeichen-Marker `SMOKE-D2 …`).
// Reihenfolge wie in meldung-kanaele-seed.mjs: erst die FK-Blocker OHNE CASCADE
// (tasks, gutachter_termine, whatsapp_inbound_messages), dann der Lead selbst.
// Fehler werden GELESEN — ein stiller DELETE-Fehlschlag ist genau der Bug aus #5305.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
const db = createClient(url, key, { auth: { persistSession: false } })

const { data: leads, error: selErr } = await db
  .from('leads')
  .select('id, kennzeichen')
  .ilike('kennzeichen', 'SMOKE-D2%')
if (selErr) throw selErr

const leadIds = (leads ?? []).map((l) => l.id)
const nachtrag = process.argv.slice(2).some((a) => a.startsWith('--claim='))
if (!leadIds.length && !nachtrag) {
  console.log('nichts zu raeumen')
  process.exit(0)
}
if (leadIds.length) console.log(`gefunden: ${leadIds.length} Lead(s) — ${(leads ?? []).map((l) => l.kennzeichen).join(', ')}`)

// ⚠ REIHENFOLGE IST WESENTLICH: `/kunde/schaden-melden` legt Lead UND Claim an.
// `claims.lead_id` ist SET NULL — wer den Lead zuerst loescht, kappt die Spur zum
// Claim und laesst ihn verwaist zurueck (beim ersten Lauf am 16.08. genau so passiert).
// Also Claims ZUERST einsammeln, solange die Verkettung noch steht.
const { data: claims } = await db.from('claims').select('id, claim_nummer').in('lead_id', leadIds)
const claimIds = (claims ?? []).map((c) => c.id)
if (claimIds.length) console.log(`  + ${claimIds.length} Claim(s): ${(claims ?? []).map((c) => c.claim_nummer).join(', ')}`)

// Verwaiste Claims aus frueheren Laeufen gezielt nachtragen: `--claim=<uuid>`.
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--claim=')) claimIds.push(arg.slice('--claim='.length))
}

for (const [tabelle, spalte] of [
  ['tasks', 'lead_id'],
  ['gutachter_termine', 'lead_id'],
  ['whatsapp_inbound_messages', 'matched_lead_id'],
]) {
  const { error } = await db.from(tabelle).delete().in(spalte, leadIds)
  if (error) console.error(`  ${tabelle}: ${error.message}`)
}

// Claims VOR den Leads (CASCADE raeumt parties/bridge/pflichtdok/tasks mit).
if (claimIds.length) {
  const { error } = await db.from('claims').delete().in('id', claimIds)
  if (error) console.error(`  claims: ${error.message}`)
}

if (leadIds.length) {
  const { error: delErr } = await db.from('leads').delete().in('id', leadIds)
  if (delErr) {
    console.error(`FEHLGESCHLAGEN: ${delErr.message}`)
    process.exit(1)
  }
}

const { data: rest } = await db.from('leads').select('id').ilike('kennzeichen', 'SMOKE-D2%')
console.log(`geraeumt. Rest-Leads: ${(rest ?? []).length}`)
