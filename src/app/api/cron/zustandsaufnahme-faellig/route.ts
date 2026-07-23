import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runZustandFaelligReminder } from '@/lib/flotte/zustand-faellig'

export const dynamic = 'force-dynamic'

/**
 * 3-Monats-Zustandsaufnahme-Reminder (Flotte).
 *
 * Findet Fleet-Fahrzeuge, deren letzte ABGESCHLOSSENE Zustandsdoku > 3 Monate zurueckliegt,
 * und erinnert die Flottenmanager der jeweiligen Firma: in-App-Mitteilung (Update-Glocke) +
 * WhatsApp-Push (best-effort). Dedup: max. 1 Reminder je Fahrzeug / 30 Tage
 * (Anker = mitteilungen kontext_typ='fahrzeug') -> idempotent bei Mehrfachlauf.
 *
 * Nur bereits-gescannte Fahrzeuge (>=1 abgeschlossener Scan) — "in drei Monaten nochmal" setzt
 * eine Erst-Aufnahme voraus; nie-gescannte Fahrzeuge sind bewusst ausgenommen.
 *
 * Schedule (VPS-Crontab): woechentlich reicht (Dedup bremst Spam), z.B. `0 8 * * 1`
 * (Mo 08:00 UTC = 10:00 MESZ). Auth: Authorization: Bearer ${CRON_SECRET}.
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  try {
    const r = await runZustandFaelligReminder(db, new Date())
    console.log(
      `[zustand-faellig] faellig=${r.faellig} benachrichtigt=${r.benachrichtigt} uebersprungen=${r.uebersprungen}`,
    )
    return NextResponse.json({ ok: true, ...r })
  } catch (err) {
    console.error('[zustand-faellig] Fehler:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
