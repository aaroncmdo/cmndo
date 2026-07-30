// WP-E (Task 8): Taeglicher Cron (02:00 UTC) — Storno-Pass + Release-Pass fuer pending
// Werkstatt-Provisionen. Kein Email-Trigger — Werkstaetten sehen ihre Provisionen im Portal.
//
// #8 P2: Die Logik lebt jetzt im generischen Runner (src/lib/provisionen/release-runner.ts) — diese
// Route ist nur noch der typ-gefilterte Wrapper. Verhalten bewusst UNVERAENDERT (nur partner_typ=
// 'werkstatt'), damit der bestehende VPS-crontab-Eintrag weiterlaeuft.
//
// ABLOESUNG: /api/cron/release-provisionen macht alle Typen (inkl. firmen_flotte, das nie einen
// Release-Pfad hatte). Sobald der crontab darauf umgestellt ist, kann diese Route entfallen.
//
// Auth: Bearer-Token via CRON_SECRET (Projekt-Konvention).

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runProvisionsRelease } from '@/lib/provisionen/release-runner'
import { bestimmeIntraNetzwerkProvisionen } from '@/lib/netzwerk/provisions-suppression'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const admin = createAdminClient()
  const result = await runProvisionsRelease(admin, {
    partnerTypen: ['werkstatt'],
    now,
    // P3 Netzwerk (Defense-in-Depth): solange der VPS-crontab noch auf diese Legacy-Route zeigt,
    // muss auch sie das Freundes-Graph-Gate fahren — sonst bypasst der Alt-Cron die Suppression.
    bestimmeUnterdrueckteProvisionen: (rows) => bestimmeIntraNetzwerkProvisionen(admin, rows),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    checked: result.checked,
    storniert: result.storniert,
    released: result.released,
    unterdrueckt: result.unterdrueckt,
    timestamp: now,
  })
}
