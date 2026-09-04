#!/usr/bin/env node
// Backfill fuer claims.source_channel / claims.source_domain (Mig 20260831225458).
//
// Holt nach, was convert-lead-to-claim.ts ab jetzt beim Anlegen tut: die Herkunft vom Lead
// an den Claim uebernehmen. Beweislage ist hier eindeutig -- der Lead existiert noch und
// KENNT seinen Kanal; es wird nichts geraten und nichts ueberschrieben, was schon dasteht.
//
// Claims OHNE Lead (26 von 57 Komplettservice-Claims, weil claims_lead_id_fkey auf
// ON DELETE SET NULL steht) sind fuer immer verloren -- ihre Herkunft existiert nirgends
// mehr. Genau das verhindert die Migration ab sofort fuer neue Faelle.
//
//   node --env-file=.env.local scripts/backfill-claim-herkunft.mjs
//   node --env-file=.env.local scripts/backfill-claim-herkunft.mjs --apply

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('ENV fehlt — mit --env-file=.env.local starten')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })
const apply = process.argv.includes('--apply')

// Nur Claims anfassen, die noch KEINE Herkunft tragen — ein bereits gesetzter Wert
// (etwa aus einem spaeteren, genaueren Pfad) wird nie ueberschrieben.
const { data: offen, error } = await db
  .from('claims')
  .select('id, claim_nummer, lead_id, source_channel, leads!claims_lead_id_fkey!inner(source_channel, source_domain)')
  .is('source_channel', null)
  .not('lead_id', 'is', null)
if (error) {
  console.error('Read fehlgeschlagen:', error.message)
  process.exit(1)
}

const kandidaten = (offen ?? [])
  .map((c) => {
    const lead = Array.isArray(c.leads) ? c.leads[0] : c.leads
    return { id: c.id, nummer: c.claim_nummer, kanal: lead?.source_channel ?? null, domain: lead?.source_domain ?? null }
  })
  // Ein Lead ohne eigenen Kanal kann keinen weitergeben — solche Claims blieben ohnehin leer.
  .filter((k) => k.kanal !== null || k.domain !== null)

console.log(`\n${offen?.length ?? 0} Claim(s) ohne Herkunft mit noch vorhandenem Lead.`)
console.log(`${kandidaten.length} davon koennen befuellt werden (Lead traegt einen Wert).\n`)

const proKanal = kandidaten.reduce((acc, k) => {
  acc[k.kanal ?? '(nur domain)'] = (acc[k.kanal ?? '(nur domain)'] ?? 0) + 1
  return acc
}, {})
for (const [kanal, n] of Object.entries(proKanal).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}x  ${kanal}`)
}

if (!apply) {
  console.log('\n(Dry-Run — nichts geaendert. Mit --apply ausfuehren.)')
  process.exit(0)
}

let ok = 0
let fehler = 0
for (const k of kandidaten) {
  // Einzeln statt gesammelt: jeder Claim bekommt SEINEN Kanal, nicht einen gemeinsamen.
  const { data, error: updErr } = await db
    .from('claims')
    .update({ source_channel: k.kanal, source_domain: k.domain })
    .eq('id', k.id)
    .select('id')
  if (updErr) {
    console.error(`  FEHLER ${k.nummer}: ${updErr.message}`)
    fehler++
  } else if ((data?.length ?? 0) === 0) {
    // Kein Fehler, aber auch keine Zeile: unter RLS bedeutet error===null nicht "hat gewirkt".
    console.error(`  ⚠ ${k.nummer}: 0 Zeilen getroffen`)
    fehler++
  } else {
    ok++
  }
}
console.log(`\n✅ ${ok} Claim(s) befuellt, ${fehler} Fehler.`)
if (fehler > 0) process.exitCode = 1

const { count: mitHerkunft } = await db
  .from('claims')
  .select('id', { count: 'exact', head: true })
  .not('source_channel', 'is', null)
const { count: gesamt } = await db.from('claims').select('id', { count: 'exact', head: true })
console.log(`Bilanz: ${mitHerkunft ?? 0} von ${gesamt ?? 0} Claims tragen jetzt eine Herkunft.`)
