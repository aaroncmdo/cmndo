import type { SupabaseClient } from '@supabase/supabase-js'
import { Reporter, updateById } from './lib'
import { SV_SACHVERSTAENDIGE_ID } from './ids'

// Die 7 profiles-Rows existieren bereits (verifiziert). Kanonische Aufgabe:
// test-sv entsperren + als aktiven, verifizierten Test-SV garantieren.
// Passwörter setzt dieser Provisioner bewusst NICHT (kein Reset -> kein HIBP-Trip).
// ⚠ Die frühere Notiz „Grandfathering (Test1234! nicht resetten; test-sv bereits
// 'Claimondo-SV-Smoke-2026')" ist widerlegt — beide Werte greifen auf prod nicht mehr.
// Gemessene Ist-Tabelle (20.08., echte Browser-Logins): siehe README dieses Ordners.
export async function ensureAccounts(
  db: SupabaseClient,
  opts: { reporter: Reporter; dryRun?: boolean },
): Promise<void> {
  await updateById(
    db,
    'sachverstaendige',
    SV_SACHVERSTAENDIGE_ID,
    {
      gesperrt_grund: null,
      gesperrt_seit: null,
      deaktiviert_am: null,
      deaktiviert_grund: null,
      ist_aktiv: true,
      verifiziert: true,
      ist_testaccount: true,
    },
    opts,
  )
  // profiles.aktiv der 7 Accounts ist bereits true (verifiziert) — kein Write nötig.
}
