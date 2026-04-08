import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReminderForTermin } from '@/lib/reminders/generate'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Nur in Development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Nur in Development verfuegbar' }, { status: 403 })
  }

  const supabase = createAdminClient()

  let body: { terminId?: string } = {}
  try {
    body = await request.json()
  } catch {
    // Kein Body → Liste pending Reminder
  }

  if (body.terminId) {
    // Reminder für einen bestimmten Termin generieren
    await generateReminderForTermin(body.terminId)

    // Generierte Reminder zurückgeben
    const { data: reminders } = await supabase
      .from('termin_reminders')
      .select('*')
      .eq('termin_id', body.terminId)
      .order('geplant_fuer', { ascending: true })

    return NextResponse.json({
      ok: true,
      action: 'generated',
      terminId: body.terminId,
      reminders: reminders ?? [],
    })
  }

  // Kein terminId → alle pending Reminder auflisten
  const { data: pending } = await supabase
    .from('termin_reminders')
    .select('id, termin_id, empfaenger, reminder_typ, geplant_fuer, status, versuche, fehler')
    .eq('status', 'pending')
    .order('geplant_fuer', { ascending: true })

  return NextResponse.json({
    ok: true,
    action: 'list',
    count: pending?.length ?? 0,
    reminders: pending ?? [],
  })
}
