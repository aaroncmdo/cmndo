#!/usr/bin/env node
// Fundament-Haertung (Audit 2026-07-07) — systematischer anon-Exposure-Guard.
//
// Schliesst die Luecke der claim-zentrierten View-Guards: audit_ungated_definer_views()
// excludet security_invoker=true + matviews + Tabellen; audit_claim_views_leaking_to_nobody()
// prueft NUR Views MIT claim_id-Spalte. Eine anon-lesbare Nicht-claim-View ohne claim_id
// (reine Partner-/Billing-/Makler-View, Muster v_partner_billing) rutscht dadurch durch.
//
// Dieser Guard ist DEFAULT-DENY ueber ALLE anon-lesbaren public-Views/Matviews:
//   Check A (empirisch): zeigt die View einem ECHTEN anon (anon-REST-Client) Zeilen? -> Leak.
//   Check B (praeventiv): anon-lesbare DEFINER-View (security_invoker=false)? -> fragile
//     RLS-Bypass-Flaeche (heute evtl. nur "safe by error"). Muss security_invoker sein
//     oder anon-Grant entzogen werden.
// Nur explizit gewhitelistete Views (bewusst oeffentliche Daten) duerfen durch.
//
// Backing-RPC: public.audit_anon_readable_views() (service_role-only) —
//   supabase/migrations/20260707135655_anon_exposure_guard_enumerator.sql
// Modell + Retry/PR-Gate: scripts/check-claim-view-rls.mjs.
// ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY.

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// .env.local laden falls vorhanden; CI-Env hat Vorrang.
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

// PR-Gate: nur bei supabase/**- oder *.sql-Aenderungen laufen (Pool-Schonung; anon-
// Exposure aendert sich nur durch View-/Grant-DDL). Bei push/lokal immer.
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
  console.log('⏭  PR beruehrt kein SQL/Migrations-File → anon-Exposure-Check uebersprungen.')
  process.exit(0)
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL || !SERVICE || !ANON) {
  console.error('❌ ENV fehlt: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  process.exit(1)
}

// Explizite Ausnahmen: Views, die anon BEWUSST Zeilen zeigen duerfen (echte oeffentliche
// Daten). Default = DENY — jede neue anon-lesbare, zeilen-zeigende oder DEFINER-View ist
// rot bis hier mit Begruendung + Migration eingetragen. Aktuell LEER: die 5 anon-lesbaren
// Views (v_claim_for_gast/v_embed_billing_faellig/v_funnel_real/v_offene_anfragen/
// v_sv_inbox) sind alle security_invoker=true und zeigen echtem anon 0 Zeilen (verifiziert).
const ANON_EXPOSURE_WHITELIST = new Set([
  // 'v_public_stats',  // Beispiel: bewusst oeffentliche Aggregat-View (Migration <ver>)
])

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000, 45_000]
function isTransient(err) {
  if (!err) return false
  const msg = String(err.message || err)
  return (
    msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNREFUSED') || /\b(52[0-4])\b/.test(msg) || /abort/i.test(msg) || msg.includes('aborted')
  )
}
async function callRpc(fn) {
  let last = null
  for (let a = 0; a <= RETRY_DELAYS_MS.length; a++) {
    const { data, error } = await svc.rpc(fn)
    if (!error) return { data, error: null }
    last = error
    if (!isTransient(error) || a === RETRY_DELAYS_MS.length) return { data: null, error }
    const wait = RETRY_DELAYS_MS[a]
    console.error(`⚠️  Versuch ${a + 1} transient — Retry in ${wait / 1000}s`)
    await new Promise((r) => setTimeout(r, wait))
  }
  return { data: null, error: last }
}

const { data: views, error } = await callRpc('audit_anon_readable_views')
if (error) {
  console.error('❌ RPC audit_anon_readable_views fehlgeschlagen:', error.message)
  console.error('   Migration: supabase/migrations/20260707135655_anon_exposure_guard_enumerator.sql')
  process.exit(1)
}

const problems = []
for (const v of views ?? []) {
  if (ANON_EXPOSURE_WHITELIST.has(v.view_name)) continue

  // Check A (empirisch, Ground-Truth): zeigt die View einem ECHTEN anon Zeilen?
  const { data: rows, error: qErr } = await anon.from(v.view_name).select('*').limit(1)
  if (!qErr && Array.isArray(rows) && rows.length > 0) {
    problems.push(
      `anon-Leak: ${v.view_name}${v.is_matview ? ' (matview)' : ''} zeigt einem echten anon Zeilen → ` +
      `REVOKE SELECT ON public.${v.view_name} FROM anon; (oder RLS-Gate; nur bei bewusst-oeffentlichen Daten whitelisten).`,
    )
    continue
  }

  // Check B (praeventiv): anon-lesbare DEFINER-View = fragile RLS-Bypass-Flaeche.
  // (matviews haben kein security_invoker-Konzept; sie deckt Check A ab.)
  if (!v.is_matview && !v.security_invoker) {
    problems.push(
      `fragile anon-DEFINER-View: ${v.view_name} ist anon-lesbar UND security_invoker=false → ` +
      `RLS-Bypass-Risiko. security_invoker=true setzen ODER REVOKE SELECT ON public.${v.view_name} FROM anon.`,
    )
  }
}

if (problems.length === 0) {
  console.log(`✓ anon-Exposure sauber: ${(views ?? []).length} anon-lesbare Views geprueft — 0 Leaks + 0 fragile DEFINER-Views.`)
  process.exit(0)
}

console.error('❌ anon-Exposure-Drift gefunden:')
for (const p of problems) console.error(`   - ${p}`)
console.error('')
console.error('Fix: `REVOKE SELECT ON public.<view> FROM anon;` ODER security_invoker=true + RLS-Gate,')
console.error('     ODER bewusst in ANON_EXPOSURE_WHITELIST (scripts/check-anon-exposure.mjs) mit Begruendung.')
process.exit(1)
