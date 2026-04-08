import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * KFZ-148 Block F: SV Payment Reminder Cron (täglich 09:00).
 * Vercel Cron Schedule: 0 9 * * *
 */
export async function GET() {
  const db = createAdminClient()

  // Alle SVs mit offener Anzahlung
  const { data: svs } = await db.from('sachverstaendige')
    .select('id, profile_id, onboarding_status, onboarding_anzahlung_faellig_am')
    .eq('onboarding_status', 'anzahlung_offen')
    .eq('portal_zugang_freigeschaltet', false)

  if (!svs?.length) return NextResponse.json({ ok: true, count: 0 })

  let sent = 0

  for (const sv of svs) {
    if (!sv.onboarding_anzahlung_faellig_am) continue
    // Tage seit Unterzeichnung = fällig_am - 14 Tage = Unterschriftsdatum
    const faelligAm = new Date(sv.onboarding_anzahlung_faellig_am)
    const unterzeichnetAm = new Date(faelligAm.getTime() - 14 * 24 * 60 * 60 * 1000)
    const tage = Math.floor((Date.now() - unterzeichnetAm.getTime()) / (1000 * 60 * 60 * 24))

    // Email + Name laden
    let email = ''
    let vorname = ''
    if (sv.profile_id) {
      const { data: p } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
      email = p?.email ?? ''
      vorname = p?.vorname ?? 'Partner'
    }

    const triggers: Array<{ tage: number; typ: string; emailSubject: string; emailBody: string; adminTask?: string }> = [
      { tage: 3, typ: 'email_3d', emailSubject: 'Erinnerung: Anzahlung noch offen', emailBody: `<p>Hallo ${vorname},</p><p>deine Anzahlung ist noch offen. Bitte schließe den Zahlungsvorgang über dein Onboarding-Portal ab.</p>` },
      { tage: 3, typ: 'admin_task_call_3d', emailSubject: '', emailBody: '', adminTask: `SV ${vorname} hat noch nicht bezahlt — anrufen` },
      { tage: 7, typ: 'email_7d', emailSubject: 'Dringende Erinnerung: Anzahlung ausstehend', emailBody: `<p>Hallo ${vorname},</p><p>deine Anzahlung ist seit 7 Tagen ausstehend. Ohne Zahlung können wir dir keine Fälle zuweisen. Bitte handle jetzt.</p>` },
      { tage: 10, typ: 'admin_task_call_10d', emailSubject: '', emailBody: '', adminTask: `Zweiter Anruf-Versuch fällig: SV ${vorname}` },
      { tage: 14, typ: 'email_14d', emailSubject: 'Letzte Mahnung — Vertrag droht zu verfallen', emailBody: `<p>Hallo ${vorname},</p><p>dies ist die letzte Erinnerung. Ohne Zahlung innerhalb der nächsten 7 Tage wird dein Vertrag aufgehoben.</p>` },
      { tage: 14, typ: 'final_warnung', emailSubject: '', emailBody: '', adminTask: `Letzte Mahnung: SV ${vorname} — manuell entscheiden ob Vertrag aufgehoben wird` },
    ]

    for (const trigger of triggers) {
      if (tage < trigger.tage) continue

      // Idempotenz: schon gesendet?
      const { data: existing } = await db.from('sv_payment_reminders')
        .select('id').eq('gutachter_id', sv.id).eq('reminder_typ', trigger.typ).limit(1).maybeSingle()
      if (existing) continue

      // Reminder senden
      if (trigger.emailSubject && email) {
        try {
          const { sendEmail } = await import('@/lib/email/google/client')
          await sendEmail({
            to: email, subject: trigger.emailSubject, html: trigger.emailBody,
            empfaengerTyp: 'sv', template: `sv_payment_${trigger.typ}`,
          })
        } catch (err) { console.error(`[KFZ-148] Reminder ${trigger.typ}:`, err) }
      }

      // Admin-Task erstellen
      if (trigger.adminTask) {
        await db.from('tasks').insert({
          titel: trigger.adminTask,
          typ: 'sv-onboarding',
          status: 'offen',
          prioritaet: tage >= 14 ? 'hoch' : 'mittel',
          faellig_am: new Date().toISOString(),
        })
      }

      // Als gesendet markieren
      await db.from('sv_payment_reminders').insert({ gutachter_id: sv.id, reminder_typ: trigger.typ })
      sent++
    }

    // Tag 21: Blockieren
    if (tage >= 21) {
      await db.from('sachverstaendige').update({ onboarding_status: 'blockiert' }).eq('id', sv.id)
    }
  }

  return NextResponse.json({ ok: true, count: sent })
}
