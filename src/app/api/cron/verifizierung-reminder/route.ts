import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'

export const dynamic = 'force-dynamic'

/**
 * AAR-359 Welle 4: Verifizierungs-Reminder Cron.
 * Läuft täglich um 09:00 (Vercel-Schedule: 0 9 * * *).
 *
 * Pro SV mit verifizierung_status='ausstehend' + verifizierung_frist_bis IS NOT NULL:
 * - Tag 7 seit Frist-Start: Halbzeit-Reminder-Email an SV (idempotent via
 *   verifizierung_reminder_7d_gesendet_am).
 * - Frist abgelaufen: Status → 'frist_ueberschritten', Admin-Task +
 *   SV-Email ("Letzte Frist abgelaufen — bitte Dokumente nachreichen").
 *
 * Frist-Start = verifizierung_frist_bis - 14 Tage (wird im Stripe-Webhook gesetzt).
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()

  // Alle SVs mit offener Tier-2-Verifizierung
  const { data: svs } = await db.from('sachverstaendige')
    .select('id, profile_id, verifizierung_status, verifizierung_frist_bis, verifizierung_reminder_7d_gesendet_am')
    .eq('verifizierung_status', 'ausstehend')
    .not('verifizierung_frist_bis', 'is', null)

  if (!svs?.length) {
    return NextResponse.json({ ok: true, checked: 0, reminders7d: 0, fristUeberschritten: 0 })
  }

  let reminders7d = 0
  let fristUeberschritten = 0

  for (const sv of svs) {
    if (!sv.verifizierung_frist_bis) continue
    const fristBis = new Date(sv.verifizierung_frist_bis)
    const fristStart = new Date(fristBis.getTime() - 14 * 24 * 60 * 60 * 1000)
    const tageSeitStart = Math.floor((now.getTime() - fristStart.getTime()) / (1000 * 60 * 60 * 24))

    // SV-Kontakt laden (einmal pro Durchgang)
    let email = ''
    let vorname = 'Partner'
    if (sv.profile_id) {
      const { data: p } = await db.from('profiles')
        .select('email, vorname')
        .eq('id', sv.profile_id)
        .single()
      email = p?.email ?? ''
      vorname = p?.vorname ?? 'Partner'
    }

    // ── Frist abgelaufen? (höchste Priorität) ──
    if (fristBis.getTime() <= now.getTime()) {
      await db.from('sachverstaendige').update({
        verifizierung_status: 'frist_ueberschritten',
        verifizierung_frist_ueberschritten_am: now.toISOString(),
      }).eq('id', sv.id)

      // SV-Email
      if (email) {
        try {
          const { sendCommunication } = await import('@/lib/communications/send')
          await sendCommunication('sv_verifizierung_frist_abgelaufen', {
            email,
            vorname,
            subject: 'Verifizierung überfällig — bitte Unterlagen sofort nachreichen',
            html: `<p>Hallo ${vorname},</p><p>die 14-Tage-Frist für Ihre Verifizierungs-Dokumente (Berufshaftpflicht, Gewerbeanmeldung, ggf. Bestellungsurkunde) ist abgelaufen.</p><p>Bitte laden Sie die fehlenden Unterlagen umgehend in Ihrem Portal unter <strong>Verifizierung</strong> hoch, um Ihre Verifizierung abzuschließen.</p>`,
          })
        } catch (err) { console.error('[AAR-359 W4] SV-Email frist_ueberschritten:', err) }
      }

      // Admin-Task. SV-Onboarding-Audit: in try/catch — wirft createLinkedTask, soll
      // der Batch NICHT sterben (Status ist oben bereits gesetzt; ein Fehler hier darf
      // die restlichen SVs dieses Cron-Laufs nicht blockieren).
      try {
        await createLinkedTask({
          titel: `Verifizierungs-Frist abgelaufen: SV ${vorname}`,
          beschreibung: `SV ${sv.id.slice(0, 8)} (${vorname}) hat die 14-Tage-Frist für Tier-2-Dokumente überschritten. Bitte prüfen ob Fristverlängerung oder Sperrung.`,
          typ: 'sv-onboarding',
          prioritaet: 'kritisch',
          faellig_am: now,
          empfaenger_rolle: 'admin',
          entity_type: 'sv_onboarding',
          entity_id: sv.id,
          trigger_event: 'verifizierung_frist_ueberschritten',
        })
      } catch (err) { console.error('[AAR-359 W4] createLinkedTask frist_ueberschritten:', err) }

      fristUeberschritten++
      continue
    }

    // ── Tag 7: Halbzeit-Reminder ──
    if (tageSeitStart >= 7 && !sv.verifizierung_reminder_7d_gesendet_am) {
      const tageNochOffen = Math.max(0, 14 - tageSeitStart)
      if (email) {
        try {
          const { sendCommunication } = await import('@/lib/communications/send')
          await sendCommunication('sv_verifizierung_reminder_7d', {
            email,
            vorname,
            subject: `Erinnerung: Verifizierungs-Dokumente in ${tageNochOffen} Tagen fällig`,
            html: `<p>Hallo ${vorname},</p><p>die Hälfte der 14-Tage-Frist für Ihre Verifizierungs-Dokumente ist um — Ihnen bleiben noch <strong>${tageNochOffen} Tage</strong>, um die fehlenden Unterlagen nachzureichen.</p><p>Bitte laden Sie Berufshaftpflicht, Gewerbeanmeldung und — falls zutreffend — die Bestellungsurkunde in Ihrem Portal unter <strong>Verifizierung</strong> hoch.</p>`,
          })
        } catch (err) { console.error('[AAR-359 W4] SV-Email reminder_7d:', err) }
      }

      await db.from('sachverstaendige').update({
        verifizierung_reminder_7d_gesendet_am: now.toISOString(),
      }).eq('id', sv.id)

      reminders7d++
    }
  }

  console.log(`[AAR-359 W4] verifizierung-reminder: ${svs.length} SVs geprüft, ${reminders7d} Tag-7-Reminder, ${fristUeberschritten} Frist-Überschritten`)

  return NextResponse.json({
    ok: true,
    checked: svs.length,
    reminders7d,
    fristUeberschritten,
  })
}
