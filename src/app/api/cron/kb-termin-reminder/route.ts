import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCommunication } from '@/lib/communications/send'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'

/**
 * KFZ-193: KB-Beratungstermin 24h-Erinnerung (stuendlich)
 * Findet kb_beratung-Termine die in 23–25h stattfinden und noch keine 24h-Erinnerung erhalten haben.
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString()
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()

  const { data: termine, error } = await db
    .from('gutachter_termine')
    .select('id, fall_id, lead_id, kb_id, start_zeit, kanal, video_link')
    .eq('typ', 'kb_beratung')
    // AAR-956: auch 'reserviert' (Auto-Beratungstermin-Default) erinnern, nicht nur bestaetigt.
    .in('status', ['reserviert', 'bestaetigt'])
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

    // CMM-49: lead_id + kunde_id faelle-frei via claims (resolveClaimId-Chokepoint).
    // geschaedigter_user_id == kunde_id (0-diff 78/0/0), claims.lead_id == faelle.lead_id.
    const claimId = termin.fall_id ? await resolveClaimId(db, termin.fall_id) : null
    const { data: claim } = claimId
      ? await db.from('claims').select('lead_id, geschaedigter_user_id').eq('id', claimId).maybeSingle()
      : { data: null }
    const fall = claim ? { lead_id: claim.lead_id, kunde_id: claim.geschaedigter_user_id } : null
    // AAR-956: lead-gebundener Auto-Beratungstermin (fall_id=NULL, kein Claim) -> direkte lead_id-Spalte als Fallback.
    const effektiveLeadId = (fall?.lead_id as string | null) ?? (termin.lead_id as string | null)

    if (effektiveLeadId) {
      const { data: lead } = await db.from('leads').select('telefon, vorname').eq('id', effektiveLeadId).single()
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
