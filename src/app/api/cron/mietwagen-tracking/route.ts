import { NextResponse } from 'next/server'
import { runMietwagenCron } from '@/lib/mietwagen/cron'

/**
 * AAR-759 Phase 1: Mietwagen-Tracking-Cron.
 * Täglich einmal — emittiert phasen-spezifische Mietwagen-Events
 * (rechnung_ausstehend / abgabe_naht / ueber_limit), die durch den
 * AAR-764 Resolver in Tasks verwandelt werden.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runMietwagenCron()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[AAR-759 mietwagen-cron] Fehler:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
