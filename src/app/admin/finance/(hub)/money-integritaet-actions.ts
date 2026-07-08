'use server'

// On-demand-Trigger fuer die Money-Integrity-Checks (Session 6f60c510). Admin-only: nutzt den
// service-role-Client (createAdminClient, RLS-bypass fuer den tabelleneubergreifenden Read) und ist
// darum hart auf 'admin' gegated. Teilt die Pruef-Logik mit dem Cron `api/cron/money-integrity-check`.

import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'
import { runMoneyIntegrityChecks, type MoneyIntegrityReport } from '@/lib/finance/money-integrity-checks'

export async function pruefeMoneyIntegritaet(): Promise<
  { ok: true; report: MoneyIntegrityReport } | { ok: false; error: string }
> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Nicht berechtigt' }

  const db = createAdminClient()
  const report = await runMoneyIntegrityChecks(db)
  return { ok: true, report }
}
