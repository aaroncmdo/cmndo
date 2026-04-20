import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('ENV fehlt'); process.exit(1) }

const sb = createClient(URL, KEY)
const emails = ['test-admin@claimondo.de','test-sv@claimondo.de','test-dispatch@claimondo.de','test-kanzlei@claimondo.de']

const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 })
if (error) { console.error('listUsers:', error.message); process.exit(1) }
const found = data.users.filter(u => emails.includes(u.email))
const missing = emails.filter(e => !found.some(u => u.email === e))

console.log('=== AUTH USERS ===')
for (const u of found) console.log(u.email, 'id=' + u.id, 'confirmed=' + !!u.email_confirmed_at)
console.log('MISSING:', missing.length ? missing.join(', ') : '(keine)')

if (found.length) {
  const ids = found.map(u => u.id)
  const { data: profs, error: pErr } = await sb.from('profiles').select('id, rolle, twofa_aktiviert, twofa_email_aktiviert, force_password_change, anzeigename').in('id', ids)
  if (pErr) console.error('profiles:', pErr.message)
  console.log('=== PROFILES ===')
  for (const p of profs ?? []) {
    const u = found.find(x => x.id === p.id)
    console.log(u?.email, 'rolle=' + p.rolle, '2fa=' + p.twofa_aktiviert, '2fa_email=' + p.twofa_email_aktiviert, 'force_pw=' + p.force_password_change, 'name=' + p.anzeigename)
  }
  const missingP = ids.filter(id => !(profs ?? []).some(p => p.id === id))
  if (missingP.length) console.log('PROFILE FEHLT:', missingP.map(id => found.find(u => u.id === id)?.email).join(', '))
}
process.exit(0)
