#!/usr/bin/env node
// RLS-Haertung — Claim-View-Gate-Drift-Bremse (Spec/Plan 2026-06-27).
//
// Stellt sicher, dass die 7 Claim-Read-Views weiter row-gegatet sind und keine
// faelschlich anon-lesbar ist. Hintergrund (wer-sieht-was-Audit 27.06.): die Views
// waren SECURITY DEFINER + an authenticated/anon granted ohne internen auth-Filter
// -> jeder Login (und anon via v_claim_base/v_claim_parties_safe) las ALLE Claims.
// Fix: Row-Gate `claim_sichtbar_fuer_aktuellen_user` in v_claim_base (deckt die 4
// Layer-Views) + die 3 Standalone-Views; anon-Grants revoked. Ein kuenftiges
// CREATE OR REPLACE (z.B. View-Kanonisierung) koennte den Gate droppen oder anon
// neu granten -> dieser Guard faengt das.
//
// Backing-RPC: public.audit_claim_view_gates() (service_role-only) —
//   supabase/migrations/20260627201851_rls_haertung_audit_claim_view_gates_rpc.sql
// Modell + Retry/PR-Gate-Pattern: scripts/check-rls-function-grants.mjs.
//
// ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

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

// PR-Gate: nur bei supabase/**- oder *.sql-Aenderungen (View-/Funktions-DDL) laufen
// (Pool-Schonung; Gate-Drift entsteht nur durch SQL). Bei push/lokal immer.
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
  console.log('⏭  PR beruehrt kein SQL/Migrations-File → Claim-View-RLS-Check uebersprungen.')
  process.exit(0)
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('❌ ENV fehlt: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein.')
  process.exit(1)
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000, 45_000]
const PER_ATTEMPT_TIMEOUT_MS = 30_000

function isTransient(err) {
  if (!err) return false
  const msg = String(err.message || err)
  return (
    msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNREFUSED') || msg.includes('UND_ERR_CONNECT_TIMEOUT') || msg.includes('UND_ERR_SOCKET') ||
    /\b(522|524|521|520)\b/.test(msg) || /Connection timed out/i.test(msg) ||
    /<title>[^<]*\d{3}[^<]*<\/title>/i.test(msg) || /abort/i.test(msg) || msg.includes('aborted')
  )
}

async function callRpc(fnName) {
  let lastError = null
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS)
    let data = null, error = null
    try {
      ;({ data, error } = await supabase.rpc(fnName).abortSignal(controller.signal))
    } catch (e) { error = e } finally { clearTimeout(timer) }
    if (!error) return { data, error: null }
    lastError = error
    if (!isTransient(error) || attempt === RETRY_DELAYS_MS.length) return { data: null, error }
    const wait = RETRY_DELAYS_MS[attempt]
    const shortMsg = String(error.message || error).slice(0, 120).replace(/\s+/g, ' ')
    console.error(`⚠️  Versuch ${attempt + 1}/${RETRY_DELAYS_MS.length + 1} transient (${shortMsg}…) — Retry in ${wait / 1000}s`)
    await new Promise((r) => setTimeout(r, wait))
  }
  return { data: null, error: lastError }
}

// v_claim_base + die 3 Standalone-Views tragen den Gate selbst; die 4 Layer-Views
// erben ihn ueber v_claim_base (muessen es also referenzieren).
const GATE_BEARING = ['v_claim_base', 'v_claim_phase', 'v_claim_listing', 'v_claim_parties_safe']
const LAYER = ['v_claim_full', 'v_faelle_mit_aktuellem_termin', 'faelle_sv_view', 'faelle_kunde_view']

// Bekannt-sichere Nicht-Claim-Definer-Views: row-gegatet ueber OWNERSHIP (auth.uid()-Werkstatt),
// NICHT ueber die Claim-Gate-Funktionen, die audit_ungated_definer_views() per Substring erkennt
// (claim_sichtbar / is_werkstatt_for_claim / v_claim_base …). Sie sind kein Claim-Read-Pfad, daher
// ist keine dieser Funktionen anwendbar -> der STATISCHE Heuristik-Check flaggt sie als False-Positive,
// obwohl sie korrekt row-gegatet + anon-revoked sind (empirisch prod-verifiziert: Fremd-User = 0 Zeilen).
// Nur der statische Check wird fuer diese EXAKT benannten Views unterdrueckt; die empirischen Checks
// (Nobody-Leak + Identity-Cross-Compare) laufen weiter, und jede Umbenennung faellt sofort zurueck ins Netz.
const OWNERSHIP_GATED_SAFE = new Set([
  // v_werkstatt_lead — Leads-View (kein Claim): WHERE werkstatt_id IN
  //   (SELECT id FROM werkstaetten WHERE user_id = auth.uid()) AND konvertiert_zu_claim_id IS NULL.
  //   Migrationen 20260705183655 (create) + 20260706094930 (schadentyp). anon REVOKED, authenticated SELECT.
  'v_werkstatt_lead',
])

const { data, error } = await callRpc('audit_claim_view_gates')
if (error) {
  console.error('❌ RPC audit_claim_view_gates fehlgeschlagen:', error.message)
  if (isTransient(error)) {
    console.error('   Transient nach Retries — Supabase-Edge/Pooler unter Load. Lokal `npm run check:claim-view-rls` retryen.')
  } else {
    console.error('   Migration: supabase/migrations/20260627201851_rls_haertung_audit_claim_view_gates_rpc.sql')
  }
  process.exit(1)
}
if (!Array.isArray(data) || data.length === 0) {
  console.error('⚠️  Audit-RPC lieferte keine Rows — Claim-Views fehlen/umbenannt? Via Dashboard pruefen.')
  process.exit(1)
}

const problems = []
for (const r of data) {
  if (r.anon_can_select) problems.push(`anon-Leak: ${r.view_name} ist anon-lesbar → REVOKE SELECT ON public.${r.view_name} FROM anon.`)
  if (GATE_BEARING.includes(r.view_name) && !r.has_gate) problems.push(`Gate fehlt: ${r.view_name} enthaelt claim_sichtbar_fuer_aktuellen_user nicht mehr.`)
  if (LAYER.includes(r.view_name) && !r.references_base && !r.has_gate) problems.push(`Layer ungated: ${r.view_name} referenziert v_claim_base nicht mehr → Gate verloren.`)
}

// Dynamische Ergaenzung (rls-safety-net 29.06.): der 7-View-Check oben ist HARTKODIERT
// (GATE_BEARING + LAYER) — genau die Luecke, durch die v_claim_timeline + v_gutachten_werte
// rutschten (Definer-Views OHNE Gate, an authenticated granted, NICHT im 7-Set; beide GEFIXT
// in Migration 20260629153151). Diese 2 Audit-Fns entdecken JEDE solche View dynamisch:
//   audit_ungated_definer_views()         = statisch (Profil: definer + app-grant + kein Gate)
//   audit_claim_views_leaking_to_nobody() = empirisch (Nobody-User sieht >0 Zeilen; faengt auch
//                                           fehlerhaft gegatete Views)
{
  const { data: ungated, error: eU } = await callRpc('audit_ungated_definer_views')
  if (eU) { console.error('❌ RPC audit_ungated_definer_views fehlgeschlagen:', eU.message); process.exit(1) }
  for (const r of (ungated ?? [])) {
    if (OWNERSHIP_GATED_SAFE.has(r.view_name)) continue // verifizierte Nicht-Claim-Ownership-View (s.o.)
    problems.push(`ungated-Definer-View: ${r.view_name} (granted: ${r.app_grants}) → Gate claim_sichtbar_fuer_aktuellen_user(claim_id) ergaenzen oder anon/auth-Grant entfernen.`)
  }
  const { data: leaking, error: eL } = await callRpc('audit_claim_views_leaking_to_nobody')
  if (eL) { console.error('❌ RPC audit_claim_views_leaking_to_nobody fehlgeschlagen:', eL.message); process.exit(1) }
  for (const r of (leaking ?? [])) problems.push(`empirischer Leak: ${r.view_name} zeigt einem Nobody-User ${r.nobody_sieht_zeilen} Zeilen → Gate fehlt/fehlerhaft.`)
  // Identity-Cross-Compare (Schritt 2b): pro Rolle (alle 8: kunde/sv/kb/kanzlei/makler/werkstatt +
  // admin/dispatch positiv-only) mit bekanntem eigenem Claim X + fremdem Claim Y — POSITIV X sichtbar
  // (faengt Unter-Exposure/Geist) + NEGATIV Y unsichtbar (Leak). Faengt GENAU die Klassen, die der
  // Nobody-Leak-Check NICHT faengt (Geist) bzw. nur grob.
  const { data: ident, error: eI } = await callRpc('audit_claim_view_identity')
  if (eI) { console.error('❌ RPC audit_claim_view_identity fehlgeschlagen:', eI.message); process.exit(1) }
  for (const r of (ident ?? [])) problems.push(`Identity-Cross-Compare [${r.rolle}/${r.view_name}]: ${r.befund}`)
}

if (problems.length === 0) {
  console.log(`✓ ${data.length} bekannte Claim-Views row-gegatet + 0 anon-Lecks + 0 ungated/leakende Views + Identity-Cross-Compare (8 Rollen) sauber.`)
  process.exit(0)
}

console.error('❌ Claim-View-RLS-Drift gefunden:')
for (const p of problems) console.error(`   - ${p}`)
console.error('')
console.error('Fix: Row-Gate `where claim_sichtbar_fuer_aktuellen_user(<claim_id>)` wiederherstellen bzw. anon-Grant revoken.')
console.error('Referenz: docs/superpowers/specs/2026-06-27-rls-haertung-claim-views-design.md')
process.exit(1)
