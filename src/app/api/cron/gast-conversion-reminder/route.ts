// AAR-826: Gast-Conversion-Reminder — Gast-Accounts ohne Konversion > 7d erinnern
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Gast-Filter via account_typ='gast' — sobald der User konvertiert wird,
  // setzt server-actions.ts:285+302 den Wert auf 'voll'. Vorher gab es hier
  // einen .is('verified_at', null)-Filter — die Spalte existiert nicht und
  // erzeugte 400 Bad Request → 500 im Cron (Vercel-Log 2026-05-05 10:00 UTC).
  const { data: gaeste, error } = await admin
    .from('profiles')
    .select('id, email, anzeigename')
    .eq('account_typ', 'gast')
    .lt('created_at', cutoff)
    .limit(100)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // E-Mail-Versand via Resend (Implementierung separat in lib/email)
  // Stub: Notification-Event anlegen pro Gast
  let sent = 0
  for (const gast of gaeste ?? []) {
    const { error: evtErr } = await admin.from('notification_events').insert({
      event_type: 'gast.conversion_reminder',
      payload: { user_id: gast.id, email: gast.email, name: gast.anzeigename },
      status: 'pending',
    })
    if (!evtErr) sent++
  }

  return NextResponse.json({
    ok: true,
    gaeste_gefunden: gaeste?.length ?? 0,
    reminder_sent: sent,
    checked_at: new Date().toISOString(),
  })
}
