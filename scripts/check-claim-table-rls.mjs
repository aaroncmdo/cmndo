#!/usr/bin/env node
// RLS-Haertung Schritt 2 — Claim-TABELLEN-RLS-Leak-Check (Pendant zu check-claim-view-rls.mjs).
//
// Die View-Ratchet (check-claim-view-rls.mjs) deckt die VIEW-Schicht (Gate = WHERE im View,
// testbar via DB-Funktion). Diese hier deckt die TABELLEN-Schicht (RLS-Policies). Tabellen-RLS
// kann NICHT via DB-Funktion getestet werden: postgres/service_role bypassen RLS, und SET ROLE
// geht nicht in einer SECURITY-DEFINER-Funktion ("cannot set parameter role"). Also: ein echter
// "Nobody"-User (eingeloggt via supabase-js, besitzt/verknuepft NICHTS) -> muss aus JEDER
// Claim-Tabelle 0 Zeilen sehen. Sieht er >0 -> RLS-Leak (die #3250-Klasse auf Tabellen:
// USING(true), fehlende/zu-breite Policy, RLS-disabled).
//
// Non-destructive (nur SELECT). Idempotent: legt den Nobody-Test-User an falls noetig.
// ENV: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.
// Modell + Retry/PR-Gate-Pattern: scripts/check-claim-view-rls.mjs.

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// .env.local laden falls vorhanden (lokal lauffaehig); CI-Env hat Vorrang (if-not-set).
;(function ladeEnv() {
  const p = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i < 0) continue
    const k = t.slice(0, i).trim()
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
})()

// PR-Gate: nur bei supabase/**- oder *.sql-Aenderungen laufen (Tabellen-RLS-Drift entsteht nur
// durch Migrations-DDL). Bei push/lokal immer. Identisch zu check-claim-view-rls.mjs.
function prTouchesSql() {
  const base = process.env.GITHUB_BASE_REF
  if (!base) return true
  try {
    execSync(`git fetch --no-tags --depth=1 origin ${base}`, { stdio: 'ignore' })
    const out = execSync(`git diff --name-only origin/${base} HEAD -- supabase "*.sql"`, { encoding: 'utf8' })
    return out.trim().length > 0
  } catch {
    return true
  }
}

if (!prTouchesSql()) {
  console.log('⏭  PR beruehrt kein SQL/Migrations-File → Claim-Table-RLS-Check uebersprungen.')
  process.exit(0)
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error('❌ ENV fehlt: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const NOBODY_EMAIL = 'test-rls-nobody@claimondo.de'
// Das Passwort stand hier im Klartext — im OEFFENTLICHEN Repo. Die Bereinigung #5797
// hat es nicht erwischt, weil `check-secrets.mjs` nur die beiden BEKANNTEN Leak-Werte
// sucht (`Claimondo2026!|Test1234!`); ein drittes Passwort ist fuer das Gate unsichtbar.
// Aufgefallen ist es erst, als die Konto-Rotation vom 31.08. den Wert entwertete und
// dieser Check mit `Invalid login credentials` DREI PRs blockierte (#5813, #5808, #5784)
// — ohne dass eine davon inhaltlich etwas damit zu tun hatte.
const NOBODY_PW = process.env.TEST_RLS_NOBODY_PASSWORD ?? ''
if (!NOBODY_PW) {
  console.error(
    '❌ ENV fehlt: TEST_RLS_NOBODY_PASSWORD — der Check meldet sich als ' +
      `${NOBODY_EMAIL} an und kann ohne Passwort nicht pruefen, ob RLS greift. ` +
      'Das Secret existiert (rotiert 31.08.); es muss im CI-Step durchgereicht werden.',
  )
  process.exit(1)
}

// Claim-Tabellen, aus denen ein Nobody NICHTS sehen darf (RLS muss greifen).
const CLAIM_TABLES = [
  'claims', 'gutachter_termine', 'fall_dokumente', 'abrechnungen',
  'claim_parties', 'gutachten', 'forderungspositionen', 'claim_vehicle_involvements',
]

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000]

function isTransient(err) {
  if (!err) return false
  const msg = String(err.message || err)
  return (
    msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNREFUSED') || msg.includes('UND_ERR_CONNECT_TIMEOUT') || msg.includes('UND_ERR_SOCKET') ||
    /\b(522|524|521|520|429|503)\b/.test(msg) || /Connection timed out/i.test(msg) ||
    /<title>[^<]*\d{3}[^<]*<\/title>/i.test(msg) || /abort/i.test(msg) || msg.includes('aborted')
  )
}

// Nobody anlegen (idempotent) + einloggen. Wirft bei Fehler (Retry-Wrapper entscheidet transient/permanent).
async function ensureNobodyUndLogin() {
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  let { data, error } = await anon.auth.signInWithPassword({ email: NOBODY_EMAIL, password: NOBODY_PW })
  if (!error && data?.session) return data.session.access_token
  if (error && isTransient(error)) throw error

  // Login schlug nicht-transient fehl (User existiert noch nicht) -> anlegen.
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: cErr } = await admin.auth.admin.createUser({
    email: NOBODY_EMAIL, password: NOBODY_PW, email_confirm: true,
  })
  if (cErr && !/already|registered|exists/i.test(cErr.message)) throw cErr
  ;({ data, error } = await anon.auth.signInWithPassword({ email: NOBODY_EMAIL, password: NOBODY_PW }))
  if (error || !data?.session) throw (error ?? new Error('Nobody-Login lieferte keine Session'))
  return data.session.access_token
}

// Ein Durchlauf: einloggen + jede Claim-Tabelle als Nobody zaehlen. Wirft bei transientem Fehler
// (Wrapper retried); nicht-transiente Tabellen-Fehler (z.B. kein Grant) = safe -> geskippt.
async function runCheck() {
  const token = await ensureNobodyUndLogin()
  const user = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const leaks = []
  for (const t of CLAIM_TABLES) {
    const { count, error } = await user.from(t).select('*', { count: 'exact', head: true })
    if (error) {
      if (isTransient(error)) throw error
      console.log(`  [skip] ${t}: ${error.message.slice(0, 60)}`) // kein Grant / RLS-deny = safe
      continue
    }
    if ((count ?? 0) > 0) leaks.push({ t, count })
    else console.log(`  [OK] ${t}: 0`)
  }
  return leaks
}

async function main() {
  console.log('=== check:claim-table-rls — Nobody-User darf aus keiner Claim-Tabelle lesen ===')
  let leaks = null
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try { leaks = await runCheck(); break }
    catch (e) {
      if (!isTransient(e) || attempt === RETRY_DELAYS_MS.length) {
        console.error('❌ Check fehlgeschlagen:', e?.message ?? e); process.exit(1)
      }
      const wait = RETRY_DELAYS_MS[attempt]
      console.error(`⚠️  Versuch ${attempt + 1}/${RETRY_DELAYS_MS.length + 1} transient — Retry in ${wait / 1000}s`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }

  if (leaks.length > 0) {
    console.error(`\n❌ RLS-LEAK: Nobody-User sieht Zeilen aus ${leaks.length} Claim-Tabelle(n):`)
    for (const l of leaks) console.error(`  - ${l.t}: ${l.count} Zeilen`)
    console.error(`\nFix: SELECT-Policy der Tabelle gateten (geschaedigter_user_id / is_claim_user_party /`)
    console.error(`     can_access_claim / Rollen-Linkage) statt USING(true), oder RLS aktivieren.`)
    process.exit(1)
  }
  console.log('\n✅ Nobody-User sieht aus keiner Claim-Tabelle Zeilen — Tabellen-RLS dicht.')
  process.exit(0)
}

main().catch((e) => { console.error('[KRITISCH]', e?.message ?? e); process.exit(1) })
