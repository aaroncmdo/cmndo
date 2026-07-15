// One-time prod config: db-backups-Bucket zusaetzlich application/gzip erlauben,
// damit der db-backup-Cron gzip-komprimierte Backups (.json.gz) hochladen kann
// (behebt die ~50-MB-Standard-Upload-400er). Additiv: application/json + Limits bleiben.
// Konventioneller Weg (Storage-Admin-API), da der Bucket auch so erstellt wurde.
//
// Run: node scripts/db-backups-allow-gzip.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const envText = readFileSync('.env.local', 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (!m) continue
  let v = m[2].trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[m[1]] = v
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SR = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE
if (!URL || !SR || !URL.includes('paizkjajbuxxksdoycev')) { console.error('env/prod check failed'); process.exit(2) }
const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } })

const before = await admin.storage.getBucket('db-backups')
console.log('[before]', JSON.stringify(before.data))

// NUR allowedMimeTypes aktualisieren — fileSizeLimit NICHT mitschicken, sonst
// re-validiert die API gg das (niedrigere) Projekt-globale Limit und wirft
// "object exceeded the maximum allowed size". Bestehende Limits bleiben erhalten.
const { data, error } = await admin.storage.updateBucket('db-backups', {
  allowedMimeTypes: ['application/json', 'application/gzip'],
})
if (error) { console.error('[updateBucket] FEHLER:', error.message); process.exit(1) }
console.log('[update]', JSON.stringify(data))

const after = await admin.storage.getBucket('db-backups')
console.log('[after]', JSON.stringify(after.data))
const ok = (after.data?.allowed_mime_types ?? []).includes('application/gzip')
  && (after.data?.allowed_mime_types ?? []).includes('application/json')
console.log(ok ? '✅ application/gzip + application/json erlaubt' : '❌ mime-Update nicht wie erwartet')
process.exit(ok ? 0 : 1)
