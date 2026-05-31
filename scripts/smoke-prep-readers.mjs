// Smoke-Prep fuer den §A7 Reader-Repoint (#2131). Reversibel.
// prep:    Passwoerter fuer smoke-admin + kb@claimondo.de (aa000001) setzen + KB
//          force_password_change=false (sonst /passwort-aendern-Redirect). kb@claimondo.de
//          ist der KB des faelle-losen Test-Claims CLM-2026-00155 (fall_id NULL).
// restore: KB force_password_change=true zurueck.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim()
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const PW = 'Cl@imondoSmoke939Xz'
const ADMIN = 'a4a2b0f2-79cd-4a74-8138-4999e2d0294b'  // smoke-admin@claimondo.test
const KB = 'aa000001-0000-0000-0000-000000000001'    // kb@claimondo.de

async function prep() {
  for (const uid of [ADMIN, KB]) {
    const { error } = await db.auth.admin.updateUserById(uid, { password: PW })
    if (error) throw new Error('set password ' + uid + ': ' + error.message)
  }
  const { error } = await db.from('profiles').update({ force_password_change: false }).eq('id', KB)
  if (error) throw new Error('KB force_password_change=false: ' + error.message)
  console.log('PREP OK: pw smoke-admin + kb@claimondo.de gesetzt; KB force_password_change=false')
}
async function restore() {
  const { error } = await db.from('profiles').update({ force_password_change: true }).eq('id', KB)
  if (error) throw new Error('restore: ' + error.message)
  console.log('RESTORE OK: kb@claimondo.de force_password_change=true')
}

const mode = process.argv[2]
if (mode === 'prep') await prep()
else if (mode === 'restore') await restore()
else { console.error('usage: node smoke-prep-readers.mjs prep|restore'); process.exit(2) }
