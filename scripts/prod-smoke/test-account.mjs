#!/usr/bin/env node
// Test-Account-Enabler (Service-Role): setzt ein bekanntes Passwort + cleart
// force_password_change, damit ein per Admin-UI angelegtes Test-Konto per
// password-grant + Cookie-Injection smokebar ist. NUR fuer Test-Konten
// (@claimondo.test). --user-id --password
import { createClient } from '@supabase/supabase-js'
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 ? process.argv[i + 1] : null }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('SERVICE-KEY fehlt (.env.local)'); process.exit(1) }
const userId = arg('user-id'); const pw = arg('password')
const doDelete = process.argv.includes('--delete')
if (!userId || (!pw && !doDelete)) { console.error('--user-id + (--password | --delete) noetig'); process.exit(1) }
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// Safety: nur Test-Konten (@claimondo.test) anfassen
const { data: u } = await admin.auth.admin.getUserById(userId)
const email = u?.user?.email ?? ''
if (!/@claimondo\.test$/.test(email)) { console.error('ABBRUCH: kein @claimondo.test-Konto:', email); process.exit(1) }

if (doDelete) {
  // profiles zuerst (falls kein CASCADE), dann Auth-User.
  await admin.from('profiles').delete().eq('id', userId)
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  console.log(JSON.stringify({ deleted: !delErr, email, error: delErr?.message ?? null }, null, 2))
  process.exit(delErr ? 1 : 0)
}

const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password: pw })
if (pwErr) { console.error('PW-Set fail:', pwErr.message); process.exit(1) }
const { error: fpErr } = await admin.from('profiles').update({ force_password_change: false }).eq('id', userId)
console.log(JSON.stringify({ ok: !pwErr, email, force_password_change_cleared: !fpErr }, null, 2))
