import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { reassignAllFaelleForInactiveKbs } from '@/lib/faelle/kb-assignment'

export const dynamic = 'force-dynamic'

/**
 * AAR-632: Täglicher Safety-Net-Cron. Findet Fälle deren
 * `kundenbetreuer_id` auf einen inaktiven User zeigt und weist sie via
 * Round-Robin an aktive KB neu zu. Admin-Fallback wenn kein KB verfügbar.
 *
 * Idempotent: scannt jede Iteration neu, läuft bei 0 inaktiven Usern
 * sofort durch ohne Writes.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const result = await reassignAllFaelleForInactiveKbs(db)

  return NextResponse.json({
    ok: true,
    ...result,
  })
}
