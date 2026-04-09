import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { render } from '@react-email/render'
import { sendEmail } from '@/lib/email/google/client'
import { AbrechnungReminderEmail, subject as reminderSubject } from '@/lib/email/google/templates/AbrechnungReminder'

export const dynamic = 'force-dynamic'

/**
 * KFZ-149 Hund-D: Erinnerungs-Cron fuer SV-Monatsabrechnungen.
 *
 * Schedule (vercel.json): 0 9 * * *  — taeglich um 09:00 UTC
 *
 * Findet alle SV-Abrechnungen die in den naechsten 3 Tagen faellig werden,
 * noch nicht bezahlt sind und denen noch keine Reminder-Mail geschickt wurde.
 * Sendet AbrechnungReminderEmail und markiert reminder_gesendet_am damit das
 * Postfach nicht doppelt befuellt wird, falls der Cron mehrfach laeuft.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET} (Vercel default Pattern, identisch
 * zu allen anderen Crons im Projekt — siehe abrechnungen-faellig-check).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Heute + 3 Tage als Fenster-Ende
  const heute = new Date()
  const inDreiTagen = new Date(heute.getTime() + 3 * 24 * 60 * 60 * 1000)
  const grenzDatum = inDreiTagen.toISOString().slice(0, 10)

  const { data: faellig, error } = await db
    .from('abrechnungen')
    .select('id, abrechnungs_nr, empfaenger_typ, empfaenger_id, empfaenger_email, empfaenger_name, summe_brutto, faellig_am')
    .eq('empfaenger_typ', 'sv')
    .is('bezahlt_am', null)
    .is('reminder_gesendet_am', null)
    .is('storniert_am', null)
    .not('faellig_am', 'is', null)
    .lte('faellig_am', grenzDatum)

  if (error) {
    console.error('[KFZ-149 reminder] Query-Fehler:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  let failed = 0

  for (const abr of faellig ?? []) {
    if (!abr.empfaenger_email) continue

    // Vorname/Nachname aus dem SV-Profile lookup (falls verfuegbar)
    let vorname: string | null = null
    let nachname: string | null = null
    if (abr.empfaenger_id) {
      // empfaenger_id koennte sachverstaendige.id ODER profile_id sein —
      // wir versuchen erst sachverstaendige, dann fallen auf profiles zurueck.
      const { data: sv } = await db.from('sachverstaendige')
        .select('profile_id')
        .eq('id', abr.empfaenger_id)
        .maybeSingle()
      const profileId = sv?.profile_id ?? abr.empfaenger_id
      const { data: p } = await db.from('profiles')
        .select('vorname, nachname')
        .eq('id', profileId)
        .maybeSingle()
      vorname = p?.vorname ?? null
      nachname = p?.nachname ?? null
    }

    const tageBisFaellig = Math.max(0, Math.ceil(
      (new Date(abr.faellig_am as string).getTime() - heute.getTime()) / (24 * 60 * 60 * 1000),
    ))

    try {
      const props = {
        vorname,
        nachname,
        abrechnungs_nr: abr.abrechnungs_nr,
        summe_brutto: Number(abr.summe_brutto ?? 0),
        faellig_am: abr.faellig_am as string,
        tage_bis_faellig: tageBisFaellig,
      }
      const html = await render(AbrechnungReminderEmail(props))
      await sendEmail({
        to: abr.empfaenger_email,
        subject: reminderSubject(props),
        html,
        empfaengerTyp: 'sv',
        template: 'abrechnung_reminder',
      })

      await db.from('abrechnungen')
        .update({ reminder_gesendet_am: new Date().toISOString() })
        .eq('id', abr.id)

      sent++
    } catch (err) {
      console.error(`[KFZ-149 reminder] Mail fuer ${abr.abrechnungs_nr} fehlgeschlagen:`, err)
      failed++
    }
  }

  console.log(`[KFZ-149 reminder] sent=${sent} failed=${failed} total_pruefung=${faellig?.length ?? 0}`)
  return NextResponse.json({ ok: true, sent, failed, total: faellig?.length ?? 0 })
}
