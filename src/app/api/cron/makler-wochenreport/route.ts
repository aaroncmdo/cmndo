// Makler-Wochenreport-Cron: verschickt an alle Makler mit aktiviertem Opt-in
// (notification_preferences.woechentlicher_report) einen Digest der letzten 7 Tage
// (neue Leads, neue Vermittlungen, offene Pipeline, freigegebene Provisionen,
// Staffel-Fortschritt). Dormante Makler (kein Content) werden uebersprungen.
//
// Kadenz: woechentlich per VPS-Crontab (z.B. Montag 07:00). Best-effort pro Makler —
// ein Mail-Fail bricht den Cron nie. Auth: Bearer-Token via CRON_SECRET.

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ladeWochenReportEmpfaenger,
  buildMaklerWochenReport,
} from '@/lib/makler/wochenreport'
import { sendMaklerWochenReport } from '@/lib/email/google/flows'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const ende = new Date()
  const start = new Date(ende.getTime() - 7 * 86_400_000)

  const empfaenger = await ladeWochenReportEmpfaenger(db)

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const makler of empfaenger) {
    try {
      const data = await buildMaklerWochenReport(db, makler, start, ende)
      if (!data) {
        skipped++
        continue
      }
      await sendMaklerWochenReport({
        to: makler.email,
        maklerId: makler.id,
        vorname: makler.vorname,
        firma: makler.firma,
        zeitraumStart: start,
        zeitraumEnde: ende,
        data,
      })
      sent++
    } catch (err) {
      failed++
      console.error(`[makler-wochenreport] makler=${makler.id} failed`, err)
    }
  }

  console.log(
    `[makler-wochenreport] eligible=${empfaenger.length} sent=${sent} skipped=${skipped} failed=${failed}`,
  )

  return NextResponse.json({
    ok: true,
    eligible: empfaenger.length,
    sent,
    skipped,
    failed,
    zeitraum: { start: start.toISOString(), ende: ende.toISOString() },
  })
}
