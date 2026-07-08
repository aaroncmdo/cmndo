// src/app/admin/vertrieb/_lib/get-vertrieb-daten.ts
// Vertrieb-CRM P1a: Staff-gegateter Loader für die Roster-Seite. requireRole (admin/
// dispatch) VOR createAdminClient (die P0-Views sind service_role-only -> Admin-Client
// nur nach Guard = kein IDOR). Komponiert die P0-Loader. Result-Object.
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVertriebKontakte } from '@/lib/vertrieb/get-vertrieb-kontakte'
import { getVertriebRollup } from '@/lib/vertrieb/get-vertrieb-rollup'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebRollupZelle } from '@/lib/vertrieb/vertrieb-rollup.types'

export async function getVertriebDaten(): Promise<
  | { ok: true; kontakte: VertriebKontakt[]; rollup: VertriebRollupZelle[] }
  | { ok: false; error: string }
> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const admin = createAdminClient()
  const [k, r] = await Promise.all([getVertriebKontakte(admin), getVertriebRollup(admin)])
  if (!k.ok) return k
  if (!r.ok) return r
  return { ok: true, kontakte: k.data, rollup: r.data }
}
