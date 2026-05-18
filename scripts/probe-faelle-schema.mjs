#!/usr/bin/env node
// CMM-48-Audit-Verify: listet ALLE aktuell existierenden faelle-Spalten.
// select('*').limit(1) → die Keys der Row sind das Live-Schema.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await svc.from('faelle').select('*').limit(1)
if (error) {
  console.error('FEHLER:', error.message)
  process.exit(1)
}
if (!data || data.length === 0) {
  console.error('Keine faelle-Row gefunden — kann Schema nicht ableiten.')
  process.exit(1)
}
const cols = Object.keys(data[0]).sort()
console.log(`faelle hat ${cols.length} Spalten:\n`)
console.log(cols.join('\n'))
