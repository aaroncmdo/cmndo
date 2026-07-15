#!/usr/bin/env node
// Repliziert den KANONISCHEN createKundeAccount-Mechanismus (flow/[token]/actions.ts
// -> finalizeKundeSetup) via Service-Role, weil die Rolle 'kunde' KEIN Admin-UI-
// Formular hat — sie entsteht ausschliesslich im mehrstufigen /flow-Onboarding-Wizard
// (KFZ-Fragen + SA-Unterschrift), was fuer ein Wegwerf-Smoke-Konto unverhaeltnismaessig
// ist. Exakt dieselben 4 Writes wie der App-Code:
//   1) auth.admin.createUser (email_confirm)
//   2) profiles.upsert rolle='kunde'
//   3) claims.geschaedigter_user_id  (RLS: Kunde sieht eigenen Claim)
//   4) claim_parties.user_id der geschaedigter-Party (RLS: parties-Array)
// telefon=NULL -> istTestKunde/kein-Comms-Guard. Reversibel (delete).
import { createClient } from '@supabase/supabase-js'
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('SERVICE-KEY fehlt'); process.exit(1) }
const FALL = arg('fall-id'), EMAIL = (arg('email') || '').trim().toLowerCase()
const PW = arg('password', 'SmokeTest2026!'), VOR = arg('vorname', 'SmokeSV'), NACH = arg('nachname', 'Testkunde')
if (!FALL || !/@claimondo\.test$/.test(EMAIL)) { console.error('--fall-id + @claimondo.test --email noetig'); process.exit(1) }
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// 1) auth user
const { data: au, error: aErr } = await admin.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true, user_metadata: { vorname: VOR, nachname: NACH, force_password_change: false } })
if (aErr || !au?.user) { console.error('createUser fail:', aErr?.message); process.exit(1) }
const userId = au.user.id
// 2) profile rolle=kunde (force_password_change:false -> direkt smokebar)
const { error: pErr } = await admin.from('profiles').upsert({ id: userId, rolle: 'kunde', vorname: VOR, nachname: NACH, email: EMAIL, telefon: null, force_password_change: false, auth_provider: 'email' }, { onConflict: 'id' })
if (pErr) { console.error('profiles fail:', pErr.message); await admin.auth.admin.deleteUser(userId); process.exit(1) }
// 3) claims.geschaedigter_user_id (fall_id == claim_id im convert-Pfad)
const { error: cErr } = await admin.from('claims').update({ geschaedigter_user_id: userId }).eq('id', FALL)
// 4) claim_parties.user_id der geschaedigter-Party
const { data: gp, error: gErr } = await admin.from('claim_parties').update({ user_id: userId }).eq('claim_id', FALL).eq('rolle', 'geschaedigter').select('id')
console.log(JSON.stringify({ ok: true, userId, email: EMAIL, claimUpdate: cErr?.message ?? 'ok', partiesLinked: gErr ? gErr.message : (gp?.length ?? 0) }, null, 2))
