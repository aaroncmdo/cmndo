#!/usr/bin/env node
// CMM-48 PR-C — Verify: claims UND faelle haben live die 2 Duplikat-Spalten
// (abgeschlossen_am, kanzlei_uebergeben_am), auf die PR-C den Writer umstellt.
// Drift-Check vor PR-Merge (Memory feedback_information_schema_check).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ENV_PATH = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local'
const env = readFileSync(ENV_PATH, 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

const COLS = ['abgeschlossen_am', 'kanzlei_uebergeben_am']
let fail = false

for (const table of ['claims', 'faelle']) {
  const { data, error } = await svc.from(table).select(COLS.join(',')).limit(1)
  if (error) {
    console.error(`[FAIL] ${table}: ${error.message}`)
    fail = true
    continue
  }
  console.log(`[OK]   ${table}: ${COLS.join(', ')} existieren (select ohne Fehler)`)
}

process.exit(fail ? 1 : 0)
