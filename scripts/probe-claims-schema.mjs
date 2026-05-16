#!/usr/bin/env node
// Claim-SSoT-Audit: dumpt die Spalten von claims + allen Lifecycle-/Sub-Tabellen.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

const tables = [
  'claims', 'faelle', 'leads', 'gutachter_termine', 'auftraege', 'kanzlei_faelle',
  'claim_parties', 'claim_vehicle_involvements', 'gutachten', 'abrechnungen',
]

for (const t of tables) {
  const { data, error } = await svc.from(t).select('*').limit(1)
  if (error) {
    console.log(`\n### ${t} — FEHLER: ${error.message}`)
    continue
  }
  if (!data || data.length === 0) {
    // leere Tabelle — Spalten via head-Request nicht ableitbar; nur melden
    console.log(`\n### ${t} — (leer, Spalten nicht via Row ableitbar)`)
    continue
  }
  const cols = Object.keys(data[0]).sort()
  console.log(`\n### ${t} — ${cols.length} Spalten\n${cols.join(', ')}`)
}
