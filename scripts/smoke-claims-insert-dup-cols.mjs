#!/usr/bin/env node
// CMM — Constraint-Smoke fuer den claimsInsert-Vollstaendigkeits-Fix.
// Schreibt die 10 neu in claimsInsert aufgenommenen Duplikat-Spalten mit
// repraesentativen Werten testweise auf einen bestehenden Claim und prueft,
// dass kein CHECK-Constraint / Typ-Fehler greift. Non-destruktiv: Originale
// werden am Ende wiederhergestellt.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ENV = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local'
const env = readFileSync(ENV, 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

const COLS = [
  'spezifikation', 'polizeibericht_status', 'gewerbe_flag', 'vorsteuerabzugsberechtigt',
  'finanzierung_leasing', 'finanzierungsgeber_name', 'finanzierungsgeber_adresse',
  'finanzierungsgeber_vertragsnr', 'zeugen_kontakte', 'kunde_email',
]

// 1. Claim picken + Originalwerte sichern.
const { data: rows, error: pErr } = await svc.from('claims').select(`id,${COLS.join(',')}`).limit(1)
if (pErr || !rows?.length) { console.error('FEHLER pick:', pErr?.message); process.exit(1) }
const claim = rows[0]
const orig = Object.fromEntries(COLS.map((c) => [c, claim[c]]))
console.log(`Testclaim: ${claim.id}`)

// 2. Testwerte schreiben — exakt die Defaults/Shapes aus claimsInsert.
//    polizeibericht_status: Original behalten (Enum-Werte unbekannt) — der
//    Rest deckt die constraint-sensiblen Spalten ab.
const test = {
  spezifikation: '__smoke_cmm__',
  polizeibericht_status: orig.polizeibericht_status,
  gewerbe_flag: false,
  vorsteuerabzugsberechtigt: false,
  finanzierung_leasing: 'keine',
  finanzierungsgeber_name: '__smoke__',
  finanzierungsgeber_adresse: '__smoke__',
  finanzierungsgeber_vertragsnr: '__smoke__',
  zeugen_kontakte: [],
  kunde_email: 'smoke@test.invalid',
}
const { error: wErr } = await svc.from('claims').update(test).eq('id', claim.id)
if (wErr) {
  console.error(`[FAIL] claims-Update abgelehnt — Constraint/Typ-Problem: ${wErr.message}`)
  process.exit(1)
}
console.log('[OK]   Alle 10 Spalten akzeptiert (inkl. finanzierung_leasing=keine, zeugen_kontakte=[])')

// 3. Originale wiederherstellen.
const { error: rErr } = await svc.from('claims').update(orig).eq('id', claim.id)
if (rErr) { console.error(`[FAIL] Restore fehlgeschlagen — claim ${claim.id} pruefen: ${rErr.message}`); process.exit(1) }
const { data: after } = await svc.from('claims').select(COLS.join(',')).eq('id', claim.id).single()
const restored = COLS.every((c) => JSON.stringify(after[c]) === JSON.stringify(orig[c]))
console.log(restored ? '[OK]   Restore bestaetigt' : '[FAIL] Restore inkonsistent')
console.log(restored ? '\nSMOKE GRUEN' : '\nSMOKE ROT')
process.exit(restored ? 0 : 1)
