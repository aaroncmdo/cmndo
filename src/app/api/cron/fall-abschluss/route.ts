import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { enqueue, buildDedupKey } from '@/lib/notifications/outbox'

export const dynamic = 'force-dynamic'

/**
 * KFZ-205: 48h Auto-Abschluss Cron.
 * Fälle mit status='zahlung-eingegangen' und schlussabrechnung_am gesetzt
 * UND schlussabrechnung_am > 48h → auto-abschluss + T13.
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
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
      // C3a: jetzt durable via Notification-Outbox — ein fehlgeschlagener Send wird
      // mit Backoff [1,5,30,120]min wiederholt und landet sonst als Dispatch-Task,
      // statt nur eine Log-Zeile zu hinterlassen (der Fall ist da schon abgeschlossen
      // und faellt aus dem Cron-Filter = es gab bisher keinen zweiten Versuch).
      // dedupKey mit Tages-Fenster: schuetzt gegen Mehrfachlaeufe am selben Tag,
      // laesst aber einen echten Re-Open + erneuten Abschluss wieder zu (die
      // bestehende Idempotenz ist der Status-Filter, kein Fuer-immer-Flag).
      await enqueue({
        dedupKey: buildDedupKey({
          template: 'fall_abgeschlossen',
          claimId: fall.id,
          fenster: new Date().toISOString().slice(0, 10),
        }),
        kanal: 'whatsapp',
        template: 'fall_abgeschlossen',
        claimId: fall.id,
      }).catch((err) => {
        console.error('[fall-abschluss-cron] Outbox-enqueue für Fall', fall.id, 'fehlgeschlagen —', err instanceof Error ? err.message : err)
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
