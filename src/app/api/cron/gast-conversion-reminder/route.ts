// AAR-826: Gast-Conversion-Reminder — Gast-Accounts ohne Konversion > 7d erinnern
import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Gast-Filter allein via account_typ='gast' — sobald ein Gast konvertiert,
  // aendert sich der Typ auf 'voll', d.h. dieser Wert filtert bereits korrekt.
  // Der fruehere .is('verified_at', null)-Filter griff auf eine NIE angelegte
  // profiles-Spalte (AAR-826-Stub) -> 400 Bad Request -> 500 im Cron
  // (Prod-Postgres-Log 2026-07-11 10:00). Re-Land von #486 (fca78e32f): der Fix
  // lag auf main, fehlte auf staging (haette sonst main beim naechsten
  // staging->main-Merge wieder regressiert).
  const { data: gaeste, error } = await admin
    .from('profiles')
    .select('id, email, anzeigename')
    .eq('account_typ', 'gast')
    .lt('created_at', cutoff)
    .limit(100)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // AAR-826 Dedup: jeden Gast nur EINMAL erinnern. notification_events ist der
  // Beleg — existiert bereits ein gast.conversion_reminder fuer den User, skippen.
  // (userId = kanonischer camelCase-Key den der fan-out liest; user_id = Legacy
  // aus evtl. alten Zeilen mitberuecksichtigt.)
  const { data: reminded } = await admin
    .from('notification_events')
    .select('payload')
    .eq('event_type', 'gast.conversion_reminder')
  const alreadyReminded = new Set<string>(
    (reminded ?? [])
      .map((r) => {
        const p = (r.payload ?? {}) as Record<string, unknown>
        return (p.userId ?? p.user_id) as string | undefined
      })
      .filter((id): id is string => !!id),
  )

  // Reminder-Event pro noch-nicht-erinnertem Gast anlegen. Der Notification-Worker
  // (api/notifications/process) fan-outed es (channel-matrix: kunde -> email) und
  // rendert das Template aus channels/email.ts (case 'gast.conversion_reminder').
  let sent = 0
  for (const gast of gaeste ?? []) {
    if (alreadyReminded.has(gast.id)) continue
    const { error: evtErr } = await admin.from('notification_events').insert({
      event_type: 'gast.conversion_reminder',
      payload: { userId: gast.id, email: gast.email, name: gast.anzeigename },
      status: 'pending',
    })
    if (!evtErr) {
      sent++
      alreadyReminded.add(gast.id)
    }
  }

  return NextResponse.json({
    ok: true,
    gaeste_gefunden: gaeste?.length ?? 0,
    reminder_sent: sent,
    checked_at: new Date().toISOString(),
  })
}
