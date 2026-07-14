import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { verarbeiteRenderQueue } from '@/lib/marketing/render-worker'

// Slice 3: Render-Worker-Cron. Holt EINEN Job aus der Render-Queue (status=render_queued)
// und rendert ihn (reap-stale -> RAM-Pre-Check -> CAS-Claim -> rendereJob). 1 Job/Lauf.
//
// VPS-Crontab (alle 3min), Auth = Bearer ${CRON_SECRET} (Projekt-Konvention, s. andere Crons):
//   */3 * * * * curl -sS -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/marketing-render >/dev/null 2>&1
//
// Laeuft im selben PM2-Prozess (keine echte OS-Isolation — Standalone-Worker waere ein spaeterer
// Schritt); der RAM-Pre-Check im Worker + das Gate in renderClip verhindern OOM-Kills.

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Render kann Minuten dauern (VPS: self-hosted, kein hartes Limit)

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const result = await verarbeiteRenderQueue(supabase)
  return NextResponse.json(result)
}
