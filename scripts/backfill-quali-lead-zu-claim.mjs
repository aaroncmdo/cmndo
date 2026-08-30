#!/usr/bin/env node
// Heilt Claims, deren Quali-Antwort nur in der Lead-Zeile steht.
//
// Hintergrund: der Self-Service-Flow schreibt die Antworten des Kunden in den LEAD. Lief die
// Claim-Konversion VORHER, kam der Wert dort nie an — und Kunde/Werkstatt/SV lesen alle den
// Claim. Der Code-Fix (spiegleQualiAufClaim) schliesst das fuer NEUE Antworten; dieses Script
// holt den Bestand nach.
//
// SICHERHEIT — was dieses Script NICHT tut:
//   * Es ueberschreibt NIE einen am Claim gesetzten Wert. Gepatcht wird ausschliesslich, wo der
//     Claim NULL ist. Prod-Messung 30.08.: 0 divergente Paare (beide gefuellt, verschieden) —
//     es gibt also keinen einzigen Fall, in dem ein bewusst abweichender Claim-Wert existiert.
//   * Es loescht nichts und legt nichts an.
//
// Default ist PREVIEW (nur lesen, nichts schreiben). Erst `--apply` schreibt:
//   node --env-file=.env.local scripts/backfill-quali-lead-zu-claim.mjs
//   node --env-file=.env.local scripts/backfill-quali-lead-zu-claim.mjs --apply

import { createClient } from '@supabase/supabase-js'

const FELDER = [
  'schuldfrage',
  'abrechnungsweg',
  'reparaturwunsch',
  'eigene_versicherung',
  'freie_werkstattwahl',
]

const apply = process.argv.includes('--apply')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (--env-file=.env.local?)')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

// PostgREST liefert ohne .range() nur 1000 Zeilen — bei aktuell <100 Claims unkritisch,
// die Grenze steht trotzdem explizit da, damit eine spaetere Datenmenge nicht still abschneidet.
const { data: claims, error: claimErr } = await db
  .from('claims')
  .select(`id, claim_nummer, lead_id, ${FELDER.join(', ')}`)
  .not('lead_id', 'is', null)
  .range(0, 4999)
if (claimErr) {
  console.error('Claims lesen fehlgeschlagen:', claimErr.message)
  process.exit(1)
}

const leadIds = [...new Set(claims.map((c) => c.lead_id))]
const { data: leads, error: leadErr } = await db
  .from('leads')
  .select(`id, ${FELDER.join(', ')}`)
  .in('id', leadIds)
  .range(0, 4999)
if (leadErr) {
  console.error('Leads lesen fehlgeschlagen:', leadErr.message)
  process.exit(1)
}
const leadById = new Map(leads.map((l) => [l.id, l]))

const arbeit = []
for (const c of claims) {
  const lead = leadById.get(c.lead_id)
  if (!lead) continue
  const patch = {}
  for (const f of FELDER) {
    const leadWert = lead[f]
    const claimWert = c[f]
    if (leadWert !== null && leadWert !== undefined && (claimWert === null || claimWert === undefined)) {
      patch[f] = leadWert
    }
  }
  if (Object.keys(patch).length > 0) arbeit.push({ claim: c, patch })
}

console.log(`\n${claims.length} Claims mit Lead geprueft — ${arbeit.length} brauchen einen Nachzug.\n`)
for (const { claim, patch } of arbeit) {
  const felder = Object.entries(patch)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join('  ')
  console.log(`  ${claim.claim_nummer ?? claim.id.slice(0, 8)}  ${felder}`)
}

const proFeld = {}
for (const { patch } of arbeit) for (const f of Object.keys(patch)) proFeld[f] = (proFeld[f] ?? 0) + 1
console.log('\nje Feld:', proFeld)

if (!apply) {
  console.log('\nPREVIEW — nichts geschrieben. Mit --apply ausfuehren.\n')
  process.exit(0)
}

let ok = 0
const fehler = []
for (const { claim, patch } of arbeit) {
  const { error } = await db.from('claims').update(patch).eq('id', claim.id)
  if (error) fehler.push(`${claim.claim_nummer}: ${error.message}`)
  else ok++
}

// Zurueckholen und vergleichen: ein fehlerfreies UPDATE beweist nicht, dass der Wert steht
// (RLS-Filter, CHECK-Reject und 0-Row-Treffer melden alle keinen Fehler).
const { data: nachher } = await db
  .from('claims')
  .select(`id, claim_nummer, ${FELDER.join(', ')}`)
  .in('id', arbeit.map((a) => a.claim.id))
  .range(0, 4999)

let bestaetigt = 0
const abweichend = []
for (const { claim, patch } of arbeit) {
  const row = (nachher ?? []).find((r) => r.id === claim.id)
  const passt = row && Object.entries(patch).every(([k, v]) => row[k] === v)
  if (passt) bestaetigt++
  else abweichend.push(claim.claim_nummer ?? claim.id.slice(0, 8))
}

console.log(`\nGeschrieben: ${ok}/${arbeit.length}`)
console.log(`Zurueckgelesen und bestaetigt: ${bestaetigt}/${arbeit.length}`)
if (fehler.length) console.log('Fehler:', fehler)
if (abweichend.length) console.log('NICHT bestaetigt:', abweichend)
process.exit(fehler.length || abweichend.length ? 1 : 0)
