'use server'

// On-demand-Trigger fuer die Termine-Integritaets-Checks (Session 6c630247). Admin-only: nutzt den
// service-role-Client (createAdminClient, RLS-bypass fuer den v_belegung-DEFINER-Read) und ist darum
// hart auf 'admin' gegated. Teilt die Pruef-Logik mit dem Cron `api/cron/termine-integrity-check`.

import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'
import {
  runTermineIntegrityChecks,
  type TermineIntegrityReport,
} from '@/lib/termine/termine-integrity-checks'

export async function pruefeTermineIntegritaet(): Promise<
  { ok: true; report: TermineIntegrityReport } | { ok: false; error: string }
> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Nicht berechtigt' }

  const db = createAdminClient()
  const report = await runTermineIntegrityChecks(db)
  return { ok: true, report }
}
