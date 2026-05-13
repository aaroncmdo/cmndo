#!/usr/bin/env node
// Check ob LexDrive die Vollmacht ausgestellt hat:
//  - webhook_events für fall_nr=SMK-SV-2026-001 mit event_type=vollmacht*
//  - faelle.vollmacht_signiert_am / vollmacht_datum / mandatsnummer
//  - timeline für Vollmacht-Events

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(path.resolve(__dirname, '..', '..', '..', '.env.local'), 'utf-8')
for (const line of raw.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const idx = t.indexOf('=')
  if (idx < 0) continue
  if (!process.env[t.slice(0, idx).trim()]) process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
}

const FALL_ID = 'bbbb3333-0000-4000-8000-000000000032'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log('=== Fall-Status ===')
const { data: fall } = await db
  .from('faelle')
  .select('id, fall_nummer, status, service_typ, mandatsnummer, vollmacht_signiert_am, vollmacht_datum, kanzlei_uebergeben_am, updated_at')
  .eq('id', FALL_ID)
  .single()
console.log(JSON.stringify(fall, null, 2))

console.log('\n=== Webhook-Events (alle, neueste zuerst) ===')
const { data: events } = await db
  .from('webhook_events')
  .select('event_id, event_type, fall_nr, status, error_message, payload, created_at')
  .eq('fall_nr', 'SMK-SV-2026-001')
  .order('created_at', { ascending: false })
  .limit(20)
console.log(`${events?.length ?? 0} Events:`)
for (const e of events ?? []) {
  console.log(`\n  ${e.created_at}  ${e.event_type}  → ${e.status}`)
  console.log(`  event_id=${e.event_id}`)
  if (e.error_message) console.log(`  err: ${e.error_message}`)
  if (e.payload && Object.keys(e.payload).length > 0) {
    const p = { ...e.payload }
    delete p.event_type; delete p.event_id; delete p.fall_nr
    if (Object.keys(p).length > 0) console.log(`  payload: ${JSON.stringify(p).slice(0, 200)}`)
  }
}

console.log('\n=== Timeline (neueste 10) ===')
const { data: tl } = await db
  .from('timeline')
  .select('typ, titel, beschreibung, created_at')
  .eq('fall_id', FALL_ID)
  .order('created_at', { ascending: false })
  .limit(10)
for (const t of tl ?? []) {
  console.log(`  ${t.created_at}  [${t.typ}] ${t.titel}`)
  if (t.beschreibung) console.log(`    ${t.beschreibung.slice(0, 200)}`)
}
