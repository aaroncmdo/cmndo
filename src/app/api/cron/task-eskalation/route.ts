import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { runEskalationsCron } from '@/lib/resolver/eskalation-cron'

/**
 * AAR-764 Phase 2: Cron-Route Task-Eskalation.
 * Prüft für alle offenen auto-erstellten Tasks, ob die Reminder-Schwelle
 * aus EVENT_TO_TASK[eventType].eskalation überschritten ist. Wenn ja:
 * Eskalations-Task für höhere Rolle erstellen, Original als eskaliert_am
 * markieren.
 *
 * Vercel-Cron-Config in `vercel.json` — empfohlen: alle 6 Stunden.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runEskalationsCron()
    return NextResponse.json({
      ok: true,
      checked: result.checked,
      eskaliert: result.eskaliert,
      task_ids: result.task_ids,
      errors: result.errors.length ? result.errors : undefined,
    })
  } catch (err) {
    console.error('[AAR-764 eskalation-cron] unerwarteter Fehler:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
