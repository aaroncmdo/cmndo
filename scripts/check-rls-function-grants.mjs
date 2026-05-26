#!/usr/bin/env node
// AAR-921 — RLS-Function-Grants-Drift-Bremse.
//
// Findet SECURITY-DEFINER-Functions in `public`, die in pg_policies referenziert
// werden, aber kein GRANT EXECUTE auf `authenticated` haben. Genau das Drift-
// Pattern aus AAR-894 (14.05.2026): CREATE OR REPLACE FUNCTION resettet Grants,
// Policy-Evaluation kippt für authenticated User auf false, Rows verschwinden
// silent (Cron-Reminders + SV-Plan-Drift). is_admin()-Short-Circuit versteckt
// den Fehler vor Admins.
//
// Verwendung:
//   node scripts/check-rls-function-grants.mjs
//
// ENV:
//   NEXT_PUBLIC_SUPABASE_URL     — Project-URL
//   SUPABASE_SERVICE_ROLE_KEY    — Service-Role-Key (RPC `audit_rls_function_grants`
//                                  ist auf service_role beschränkt)
//
// Backing-Function: public.audit_rls_function_grants() —
//   supabase/migrations/20260515111313_aar921_audit_rls_grants_rpc.sql
//
// CI: läuft als Pre-Build-Step in .github/workflows/ci.yml.
// Memory: feedback_rls_function_grants.md beschreibt den Inzident AAR-894.
//
// Retry-Verhalten (eingeführt im Fix nach CI-FAILURE 15.05.2026, PR #1329):
// GitHub-Runners bekamen sporadisch Cloudflare-Error-522 (Connection-Timed-Out)
// vom Supabase-Edge. Lokal lief der Check in <2s grün — reines Transient-
// Phänomen zwischen GH-Edge und Supabase-Pooler. Daher: Retry mit Backoff
// nur bei fetch-/CF-522/524-Fehlern. Echte RPC-Fehler (Function fehlt,
// Permission-Denied) bleiben hart-fatal ohne Retry.

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

// ── Relevanz-Gate (26.05.2026) ──────────────────────────────────────────────
// Der Check trifft Supabase via PostgREST/Pooler. Bei vielen parallelen Sessions
// auf der geteilten Prod-DB saturiert der Pool → die Audit-RPC hängt minutenlang,
// alle Retries laufen in den 30s-Abort, der Step failt — und blockt damit auch
// PRs, die überhaupt kein SQL anfassen (am 26.05.2026: #1754, #1757, #1762).
// Grant-Drift entsteht aber NUR durch Migrations-/Funktions-SQL. Daher: in einem
// PR-Build (GITHUB_BASE_REF gesetzt) nur weiterlaufen, wenn die PR supabase/**
// oder *.sql berührt — sonst Exit 0 (skip), ohne Supabase anzufassen. Bei
// push/lokal (kein GITHUB_BASE_REF) läuft der Check immer; bei git-Fehlern
// fail-safe weiter (lieber unnötig prüfen als Drift verpassen). Das Check-Script
// selbst ist bewusst NICHT im Pathspec: reine CI-Wartung soll den fragilen
// Live-Check nicht auslösen (Validierung via `node --check` + lokalem Lauf).
//
// (Bewusst im Script statt in ci.yml: workflow-ändernde PRs triggern über den
// CI-Automations-Token keinen Actions-Run — eine Script-Datei dagegen schon.)
function prTouchesSql() {
  const base = process.env.GITHUB_BASE_REF
  if (!base) return true // kein PR-Kontext (push/lokal) → immer prüfen
  try {
    execSync(`git fetch --no-tags --depth=1 origin ${base}`, { stdio: 'ignore' })
    const out = execSync(
      `git diff --name-only origin/${base} HEAD -- supabase "*.sql"`,
      { encoding: 'utf8' },
    )
    return out.trim().length > 0
  } catch {
    return true // git-Fehler → fail-safe: Check laufen lassen
  }
}

if (!prTouchesSql()) {
  console.log('⏭  PR berührt kein SQL/Migrations-File → RLS-Grants-Check übersprungen (Pool-Schonung).')
  process.exit(0)
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error('❌ ENV fehlt: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.')
  process.exit(1)
}

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Retries: 5 Versuche mit Backoff (vorher 3). Bei anhaltender Pooler-Last
// (CI-Burst: viele parallele Builds gegen dieselbe Supabase) reichten 3 nicht —
// mehrere CI-FAILUREs am 25./26.05.2026 liefen alle 4 Attempts in 522.
const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000, 45_000]

// Per-Attempt-Timeout: ein einzelner .rpc()-fetch kann ohne Timeout unendlich
// haengen (GH-Edge → Supabase-Pooler antwortet nicht), was den Build-Step
// blockiert statt failt (Hang-Incidents #1705/#1707, ~14 Min stuck). Der
// AbortController bricht nach PER_ATTEMPT_TIMEOUT_MS ab → zaehlt als transient
// → naechster Retry.
const PER_ATTEMPT_TIMEOUT_MS = 30_000

function isTransient(err) {
  if (!err) return false
  const msg = String(err.message || err)
  return (
    msg.includes('fetch failed') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('UND_ERR_CONNECT_TIMEOUT') ||
    msg.includes('UND_ERR_SOCKET') ||
    // Cloudflare-HTML-Fehlerseite (522/524/521/520) kommt als String im error.message
    /\b(522|524|521|520)\b/.test(msg) ||
    /Connection timed out/i.test(msg) ||
    /<title>[^<]*\d{3}[^<]*<\/title>/i.test(msg) ||
    // Per-Attempt-AbortController-Timeout (haengender fetch) — als transient retryen
    /abort/i.test(msg) ||
    msg.includes('aborted')
  )
}

async function callAuditRpc() {
  let lastError = null
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    // Per-Attempt-Timeout via AbortController: bricht einen haengenden fetch ab,
    // statt den Build-Step unendlich zu blockieren.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS)
    let data = null
    let error = null
    try {
      ;({ data, error } = await supabase
        .rpc('audit_rls_function_grants')
        .abortSignal(controller.signal))
    } catch (e) {
      // Abort/Netzfehler je nach supabase-js-Version als throw statt {error}
      error = e
    } finally {
      clearTimeout(timer)
    }
    if (!error) return { data, error: null }
    lastError = error
    if (!isTransient(error) || attempt === RETRY_DELAYS_MS.length) {
      return { data: null, error }
    }
    const wait = RETRY_DELAYS_MS[attempt]
    const shortMsg = String(error.message || error).slice(0, 120).replace(/\s+/g, ' ')
    console.error(`⚠️  Versuch ${attempt + 1}/${RETRY_DELAYS_MS.length + 1} transient (${shortMsg}…) — Retry in ${wait / 1000}s`)
    await new Promise((r) => setTimeout(r, wait))
  }
  return { data: null, error: lastError }
}

const { data, error } = await callAuditRpc()

if (error) {
  console.error('❌ RPC audit_rls_function_grants fehlgeschlagen:', error.message)
  if (isTransient(error)) {
    console.error('   Transient-Fehler nach Retries — Supabase-Edge oder Pooler unter Load.')
    console.error('   Lokal nochmal `npm run check:rls-grants` versuchen; bei wiederholtem Fehl Status checken.')
  } else {
    console.error('   Migration anwenden: supabase/migrations/20260515111313_aar921_audit_rls_grants_rpc.sql')
  }
  process.exit(1)
}

if (!Array.isArray(data) || data.length === 0) {
  console.error('⚠️  Audit-RPC hat keine Rows zurückgegeben — entweder gibt es keine RLS-')
  console.error('    referenzierten SECDEF-Functions mehr (Verdachtsmoment!) oder pg_policies')
  console.error('    × pg_proc liefert nichts. Verifiziere via Supabase-Dashboard.')
  process.exit(1)
}

const missingAuth = data.filter((r) => r.auth_exec === false)
const missingSvc = data.filter((r) => r.svc_exec === false)

if (missingAuth.length === 0 && missingSvc.length === 0) {
  console.log(`✓ Alle ${data.length} RLS-referenzierten SECDEF-Functions haben EXECUTE für authenticated + service_role.`)
  for (const r of data) {
    console.log(`  - ${r.fn_sig.padEnd(50)} (${r.policy_refs} Policies)`)
  }
  process.exit(0)
}

console.error(`❌ RLS-Grant-Drift gefunden:`)
console.error('')
if (missingAuth.length > 0) {
  console.error(`  authenticated ohne EXECUTE (${missingAuth.length} Functions):`)
  for (const v of missingAuth) {
    console.error(`    - ${v.fn_sig}  (${v.policy_refs} Policies)`)
  }
  console.error('')
}
if (missingSvc.length > 0) {
  console.error(`  service_role ohne EXECUTE (${missingSvc.length} Functions):`)
  for (const v of missingSvc) {
    console.error(`    - ${v.fn_sig}  (${v.policy_refs} Policies)`)
  }
  console.error('')
}
console.error('Fix: Migration mit `GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO authenticated;`')
console.error('Vorlage: supabase/migrations/20260515110633_aar921_rls_function_grants_backfill.sql')
console.error('Pattern: jede neue SECDEF-Function in RLS-Policy braucht ein GRANT in derselben Migration.')
process.exit(1)
