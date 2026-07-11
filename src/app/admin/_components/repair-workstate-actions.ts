'use server'

// On-demand-Trigger fuer die Reparatur-Workstate-Checks (WS6 Slice 2). Admin-only: nutzt den
// service-role-Client und ist hart auf 'admin' gegated. Teilt die Pruef-Logik mit dem Cron
// `api/cron/repair-workstate-check`.

import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'
import {
  runReparaturWorkstateChecks,
  type ReparaturWorkstateReport,
} from '@/lib/werkstatt/repair-workstate-checks'

export async function pruefeReparaturWorkstate(): Promise<
  { ok: true; report: ReparaturWorkstateReport } | { ok: false; error: string }
> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Nicht berechtigt' }

  const db = createAdminClient()
  const report = await runReparaturWorkstateChecks(db)
  return { ok: true, report }
}
