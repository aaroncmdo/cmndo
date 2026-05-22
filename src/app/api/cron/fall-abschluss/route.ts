import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { sendFallCommunication } from '@/lib/communications/send-fall'

export const dynamic = 'force-dynamic'

/**
 * KFZ-205: 48h Auto-Abschluss Cron.
 * Fälle mit status='zahlung-eingegangen' und schlussabrechnung_am gesetzt
 * UND schlussabrechnung_am > 48h → auto-abschluss + T13.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  // CMM-44 SP-J Bucket B: schlussabrechnung_am liegt auf claims (SSoT). Der
  // .not/.lt-Filter laesst sich nicht auf einem Embed ausdruecken → ueber die
  // repointete View, die schlussabrechnung_am flach aus claims exponiert
  // (view.id = faelle.id, status flach aus faelle).
  const { data: faelle } = await db
    .from('v_faelle_mit_aktuellem_termin')
    .select('id, schlussabrechnung_am')
    .eq('status', 'zahlung-eingegangen')
    .not('schlussabrechnung_am', 'is', null)
    .lt('schlussabrechnung_am', cutoff)

  let abgeschlossen = 0

  for (const fall of faelle ?? []) {
    try {
      await transitionFallStatus(fall.id, 'abgeschlossen')

      // T13: Fall abgeschlossen
      // AAR-719: Silent-Catch durch Logging ersetzt — Benachrichtigungs-
      // Fehler waren unsichtbar, Kunde bekam kein Abschluss-Email.
      sendFallCommunication(fall.id, 'fall_abgeschlossen').catch((err) => {
        console.error('[fall-abschluss-cron] Abschluss-Benachrichtigung für Fall', fall.id, 'fehlgeschlagen —', err instanceof Error ? err.message : err)
      })

      await db.from('timeline').insert({
        fall_id: fall.id,
        typ: 'system',
        titel: 'Fall automatisch abgeschlossen (48h nach Schlussabrechnung)',
      })

      abgeschlossen++
    } catch {
      // Transition nicht erlaubt — überspringen
    }
  }

  return NextResponse.json({ ok: true, abgeschlossen, checked: faelle?.length ?? 0 })
}
