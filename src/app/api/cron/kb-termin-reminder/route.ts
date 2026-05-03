import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCommunication } from '@/lib/communications/send'

/**
 * KFZ-193: KB-Beratungstermin 24h-Erinnerung (stuendlich)
 * Findet kb_beratung-Termine die in 23–25h stattfinden und noch keine 24h-Erinnerung erhalten haben.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString()
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()

  const { data: termine, error } = await db
    .from('gutachter_termine')
    .select('id, fall_id, kb_id, start_zeit, kanal, video_link')
    .eq('typ', 'kb_beratung')
    .eq('status', 'bestaetigt')
    .gte('start_zeit', in23h)
    .lte('start_zeit', in25h)
    .is('reminder_sent_at', null)
    .is('cancelled_at', null)

  if (error) {
    console.error('[kb-termin-reminder] Query-Fehler:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let sent = 0

  for (const termin of termine ?? []) {
    const startDate = new Date(termin.start_zeit)
    const datum = startDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit' })
    const uhrzeit = startDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })

    // Lade Kundendaten
    let telefon: string | null = null
    let vorname = 'Kunde'

    const { data: fall } = await db
      .from('faelle')
      .select('lead_id, kunde_id')
      .eq('id', termin.fall_id)
      .single()

    if (fall?.lead_id) {
      const { data: lead } = await db.from('leads').select('telefon, vorname').eq('id', fall.lead_id).single()
      if (lead?.telefon) telefon = lead.telefon
      if (lead?.vorname) vorname = lead.vorname
    }

    if (!telefon && fall?.kunde_id) {
      const { data: profile } = await db.from('profiles').select('telefon, vorname').eq('id', fall.kunde_id).single()
      if (profile?.telefon) telefon = profile.telefon
      if (profile?.vorname) vorname = profile.vorname
    }

    if (telefon) {
      await sendCommunication('kb_termin_reminder_24h', {
        telefon,
        vorname,
        '1': vorname,
        '2': datum,
        '3': uhrzeit,
        '4': termin.kanal === 'video' ? 'Video-Call' : 'Telefon',
      })
    }

    // Reminder-Timestamp setzen (auch wenn WhatsApp nicht gesendet wurde)
    const { error: updateErr } = await db
      .from('gutachter_termine')
      .update({ reminder_sent_at: now.toISOString() })
      .eq('id', termin.id)

    if (updateErr) {
      console.error(`[kb-termin-reminder] Update-Fehler für ${termin.id}:`, updateErr.message)
    } else {
      sent++
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    checked_at: now.toISOString(),
  })
}
