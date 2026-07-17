import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/google/client'

/**
 * AAR-956: Proaktive Anlage-Benachrichtigung fuer Auto-Beratungstermine.
 *
 * Findet neu angelegte (status='reserviert'), lead-gebundene kb_beratung-Termine, die noch
 * keine Anlage-Email erhalten haben, und schickt dem Kunden eine "vorgemerkt, passt das?"-Email.
 * Deckt v.a. Email-only-Leads ab, die KEINEN (telefonbasierten) WA-Reminder bekommen koennen.
 * (Proaktive WA-at-creation = Follow-up: braucht ein eigenes Twilio-Template.)
 *
 * Scheduling: z.B. alle 10 Minuten (Crontab/pg_cron, Bearer CRON_SECRET).
 */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()

  const { data: termine, error } = await db
    .from('gutachter_termine')
    .select('id, lead_id, assignee_id, start_zeit, kanal')
    .eq('typ', 'kb_beratung')
    .eq('status', 'reserviert')
    .not('lead_id', 'is', null)
    .is('anlage_benachrichtigt_at', null)
    .is('cancelled_at', null)
    .gt('start_zeit', now.toISOString())
    .limit(200)

  if (error) {
    console.error('[kb-beratung-anlage-notify] Query-Fehler:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let processed = 0
  let sent = 0

  for (const termin of termine ?? []) {
    processed++

    // Kontakt: lead-gebunden (direkte lead_id).
    const { data: lead } = await db
      .from('leads')
      .select('email, vorname')
      .eq('id', termin.lead_id as string)
      .single()

    // KB-Vorname (assignee_id -> profiles); 0-KB-Fallback -> generisch.
    let kbVorname = 'Ihrem Schadenberater'
    if (termin.assignee_id) {
      const { data: kb } = await db
        .from('profiles')
        .select('vorname')
        .eq('id', termin.assignee_id as string)
        .maybeSingle()
      if (kb?.vorname) kbVorname = kb.vorname as string
    }

    const startDate = new Date(termin.start_zeit as string)
    const datum = startDate.toLocaleDateString('de-DE', {
      timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    })
    const uhrzeit = startDate.toLocaleTimeString('de-DE', {
      timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit',
    })
    const kanalText = termin.kanal === 'video' ? 'per Video-Call' : 'telefonisch'
    const vorname = (lead?.vorname as string | null) ?? null

    // AAR-956 17.07. (Befund 6, Benachrichtigungs-Matrix PR #4490): der KB erfuhr vom
    // Auto-Beratungstermin NUR per Kalender-Blick — jetzt Mitteilung an den assignee.
    // Non-critical: Fehler blockiert weder Kunden-Email noch das Flag.
    if (termin.assignee_id) {
      try {
        const { createMitteilung } = await import('@/lib/mitteilungen/create-mitteilung')
        await createMitteilung({
          empfaenger_id: termin.assignee_id as string,
          empfaenger_rolle: 'kundenbetreuer',
          kategorie: 'update',
          titel: 'Neuer Auto-Beratungstermin',
          inhalt: `${datum} um ${uhrzeit} Uhr (${kanalText})${vorname ? ` — Kunde: ${vorname}` : ''} — automatisch vorgemerkt.`,
          kontext_typ: 'lead',
          kontext_id: (termin.lead_id as string) ?? undefined,
        })
      } catch (err) {
        console.error(`[kb-beratung-anlage-notify] KB-Mitteilung-Fehler für Termin ${termin.id}:`, err)
      }
    }

    const email = (lead?.email as string | null) ?? null
    if (email) {
      const anrede = vorname ? `Hallo ${esc(vorname)},` : 'Hallo,'

      try {
        await sendEmail({
          to: email,
          subject: 'Ihr kostenloser Beratungstermin bei Claimondo',
          html: `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; line-height: 1.5;">
  <p>${anrede}</p>
  <p>wir haben für Sie einen <strong>kostenlosen Beratungstermin</strong> mit ${esc(kbVorname)} vorgemerkt:</p>
  <p style="font-size: 18px; font-weight: bold; margin: 18px 0;">${esc(datum)} um ${esc(uhrzeit)} Uhr (${kanalText})</p>
  <p>Passt Ihnen dieser Termin? Falls nicht, antworten Sie einfach kurz auf diese E-Mail oder rufen Sie uns an — wir finden gemeinsam eine passende Zeit.</p>
  <p>Wir freuen uns auf das Gespräch!</p>
  <p>Mit freundlichen Grüßen<br>Ihr Claimondo-Team</p>
</div>`,
        })
        sent++
      } catch (err) {
        console.error(`[kb-beratung-anlage-notify] Email-Fehler für Termin ${termin.id}:`, err)
      }
    }

    // Flag setzen — auch ohne Email (Telefon-only-Leads kriegen den WA-Reminder), damit der
    // Cron den Termin nicht endlos re-scannt.
    const { error: updErr } = await db
      .from('gutachter_termine')
      .update({ anlage_benachrichtigt_at: now.toISOString() })
      .eq('id', termin.id)
    if (updErr) console.error(`[kb-beratung-anlage-notify] Flag-Update-Fehler für ${termin.id}:`, updErr.message)
  }

  return NextResponse.json({ ok: true, processed, sent, checked_at: now.toISOString() })
}
