import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkCompletionSignal } from '@/lib/sla/completion-signals'
import { completeKanzleiSla } from '@/lib/sla/kanzlei-tracker'
import { handleKanzleiBreach, type SlaRecord } from '@/lib/sla/kanzlei-mahnungen'
import { workingDaysBetween } from '@/lib/sla/workdays'
import type { KanzleiSlaTyp } from '@/lib/sla/blocker-detection'

export const dynamic = 'force-dynamic'

/**
 * AAR-431: Daily-Cron für Kanzlei-SLAs.
 *
 * Schedule (vercel.json): 0 8 * * * — täglich 08:00 UTC
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Flow pro aktivem Kanzlei-SLA:
 *   1. Completion-Signal aus DB prüfen → ggf. completeKanzleiSla()
 *   2. Sonst: wenn breach_at < NOW() und status='pending' → Stufe 1 Mahnung
 *   3. Wenn status='breached' und letzte_mahnung_am + 3/7 WT < NOW() → Stufe 2/3
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()

  const { data: activeSlas, error } = await db
    .from('sla_tracking')
    .select(
      'id, fall_id, sla_typ, status, started_at, breach_at, n_mahnungen, letzte_mahnung_am, phase, blocker_rolle, blocker_grund',
    )
    .eq('target_rolle', 'kanzlei')
    .in('status', ['pending', 'breached'])

  if (error) {
    console.error('[AAR-431 cron] Query-Fehler:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let completed = 0
  let breached = 0
  let remindedStufe2 = 0
  let remindedStufe3 = 0
  let unchanged = 0

  for (const row of activeSlas ?? []) {
    const sla: SlaRecord = {
      id: row.id as string,
      fall_id: row.fall_id as string,
      sla_typ: row.sla_typ as KanzleiSlaTyp,
      status: row.status as string,
      started_at: row.started_at as string,
      breach_at: row.breach_at as string,
      n_mahnungen: (row.n_mahnungen as number | null) ?? 0,
      letzte_mahnung_am: (row.letzte_mahnung_am as string | null) ?? null,
      phase: (row.phase as string | null) ?? null,
      blocker_rolle: (row.blocker_rolle as string | null) ?? null,
      blocker_grund: (row.blocker_grund as string | null) ?? null,
    }

    // ─── 1) Completion-Signal prüfen ─────────────────────────────────
    try {
      const done = await checkCompletionSignal({ id: sla.id, fall_id: sla.fall_id, sla_typ: sla.sla_typ })
      if (done) {
        await completeKanzleiSla(sla.fall_id, sla.sla_typ)
        completed++
        continue
      }
    } catch (err) {
      console.error(`[AAR-431 cron] completion-check Fehler SLA ${sla.id}:`, err)
    }

    // ─── 2) Erster Breach: status=pending und breach_at < now ───────
    if (sla.status === 'pending' && new Date(sla.breach_at) < now) {
      try {
        const result = await handleKanzleiBreach(sla)
        if (result.stufe === 1) breached++
      } catch (err) {
        console.error(`[AAR-431 cron] handleKanzleiBreach Stufe 1 SLA ${sla.id}:`, err)
      }
      continue
    }

    // ─── 3) Folge-Mahnungen: status=breached, Zeit-Schwellen ─────────
    if (sla.status === 'breached') {
      const letzte = sla.letzte_mahnung_am ? new Date(sla.letzte_mahnung_am) : null
      if (!letzte) {
        unchanged++
        continue
      }
      const wtSeit = workingDaysBetween(letzte, now)
      const aktuellStufe = sla.n_mahnungen ?? 0

      if ((aktuellStufe === 1 && wtSeit >= 3) || (aktuellStufe === 2 && wtSeit >= 7)) {
        try {
          const result = await handleKanzleiBreach(sla)
          if (result.stufe === 2) remindedStufe2++
          else if (result.stufe === 3) remindedStufe3++
          else unchanged++
        } catch (err) {
          console.error(`[AAR-431 cron] handleKanzleiBreach Folgestufe SLA ${sla.id}:`, err)
        }
      } else {
        unchanged++
      }
    }
  }

  const total = activeSlas?.length ?? 0
  console.log(
    `[AAR-431 cron] total=${total} completed=${completed} breached=${breached} stufe2=${remindedStufe2} stufe3=${remindedStufe3} unchanged=${unchanged}`,
  )

  return NextResponse.json({
    ok: true,
    total,
    completed,
    breached,
    reminded_stufe_2: remindedStufe2,
    reminded_stufe_3: remindedStufe3,
    unchanged,
  })
}
