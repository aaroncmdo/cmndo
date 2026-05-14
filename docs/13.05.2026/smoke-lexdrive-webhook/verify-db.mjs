#!/usr/bin/env node
// Verifikation: Hat der Webhook-Smoke wirklich `webhook_events`-Rows angelegt?

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

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await db
  .from('webhook_events')
  .select('event_id, event_type, fall_nr, source, status, error_message, processed_at, created_at')
  .or('event_id.like.aaron-smoke-%,event_id.like.test-skip-%')
  .order('created_at', { ascending: false })
  .limit(10)

if (error) { console.error('DB-Fehler:', error.message); process.exit(1) }
console.log(`webhook_events Rows aus Smoke: ${data?.length ?? 0}\n`)
for (const r of data ?? []) {
  console.log(`  event=${r.event_type}  fall=${r.fall_nr}  status=${r.status}  ${r.error_message ? '(err: '+r.error_message+')' : ''}`)
  console.log(`  event_id=${r.event_id}  created=${r.created_at}\n`)
}
