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

import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error('❌ ENV fehlt: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.')
  process.exit(1)
}

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data, error } = await supabase.rpc('audit_rls_function_grants')

if (error) {
  console.error('❌ RPC audit_rls_function_grants fehlgeschlagen:', error.message)
  console.error('   Migration anwenden: supabase/migrations/20260515111313_aar921_audit_rls_grants_rpc.sql')
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
