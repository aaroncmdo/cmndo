import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Echter externer Funnel (test-daten-bewusst) — liest die v_funnel_real-View
 * (Test-SV-Claims + is_test_lead-Leads ausgeschlossen). CRON_SECRET-gated.
 *
 * Dashboards sollten v_funnel_real / is_test_lead(email) DIREKT nutzen; diese Route
 * ist der erreichbare Monitoring-/Smoke-Endpunkt gegen Test-Daten-Fehlalarme.
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  // v_funnel_real ist eine neue View (noch nicht in database.types) -> as never Cast (wie golden_path).
  const { data, error } = await admin.from('v_funnel_real' as never).select('*').single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ funnel_real: data }, { status: 200 })
}
