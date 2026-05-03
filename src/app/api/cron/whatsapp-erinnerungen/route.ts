import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFallCommunication } from '@/lib/communications/send-fall'

/**
 * Cron-Route: Prueft gutachter_termine auf bevorstehende Termine
 * und sendet WhatsApp-Erinnerungen (24h und 2h vorher).
 *
 * Aufgerufen per Vercel Cron (alle 30 Minuten).
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  let sent24h = 0
  let sent2h = 0

  // ─── 24h Erinnerung ────────────────────────────────────────────────────
  // Termine die in 23-25 Stunden stattfinden (Fenster fuer Cron-Intervall)
  const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString()
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()

  const { data: termine24h } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, start_zeit')
    .gte('start_zeit', in23h)
    .lte('start_zeit', in25h)
    .eq('status', 'bestaetigt')

  for (const termin of termine24h ?? []) {
    if (!termin.fall_id) continue

    // Check if we already sent a 24h reminder for this termin
    const { data: existing } = await supabase
      .from('nachrichten')
      .select('id')
      .eq('fall_id', termin.fall_id)
      .eq('kanal', 'whatsapp')
      .like('nachricht', '%zur Erinnerung: Morgen%')
      .limit(1)

    if (existing && existing.length > 0) continue

    const startZeit = new Date(termin.start_zeit)
    await sendFallCommunication(termin.fall_id, 'reminder_24h', {
      termin_uhrzeit: startZeit.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
      '3': startZeit.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
    })
    sent24h++
  }

  // ─── 2h Erinnerung ─────────────────────────────────────────────────────
  // Termine die in 1.5-2.5 Stunden stattfinden
  const in90min = new Date(now.getTime() + 90 * 60 * 1000).toISOString()
  const in150min = new Date(now.getTime() + 150 * 60 * 1000).toISOString()

  const { data: termine2h } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, start_zeit')
    .gte('start_zeit', in90min)
    .lte('start_zeit', in150min)
    .eq('status', 'bestaetigt')

  for (const termin of termine2h ?? []) {
    if (!termin.fall_id) continue

    // Check if we already sent a 2h reminder for this termin
    const { data: existing } = await supabase
      .from('nachrichten')
      .select('id')
      .eq('fall_id', termin.fall_id)
      .eq('kanal', 'whatsapp')
      .like('nachricht', '%in 2 Stunden%')
      .limit(1)

    if (existing && existing.length > 0) continue

    await sendFallCommunication(termin.fall_id, 'reminder_2h')
    sent2h++
  }

  return NextResponse.json({
    ok: true,
    sent_24h: sent24h,
    sent_2h: sent2h,
    checked_at: now.toISOString(),
  })
}
