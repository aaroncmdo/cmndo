import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * KFZ-192: Vollmacht-Reminder Cron.
 * Läuft täglich um 10:00 Uhr.
 * Prüft Fälle mit service_typ='komplett', noch nicht unterschriebener Vollmacht,
 * und einem Termin mit status='reserviert'.
 *
 * - 1 Tag alt → erster Reminder
 * - 3 Tage alt → zweiter Reminder
 * - 7 Tage alt → Admin-Task erstellen
 * Idempotent via Timeline-Duplikat-Check.
 */

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()

  // Fälle laden: komplett + reservierter Termin + Vollmacht nicht unterschrieben.
  // AAR-583 (N6): `faelle.vollmacht_unterschrieben` gab es in der DB nie als
  // eigene Spalte (pre-existing Drift) — canonical ist `vollmacht_signiert_am`
  // (Timestamp, NULL bedeutet „noch nicht unterschrieben").
  // CMM-47 A.2: faelle → v_claim_full (Sync-Trigger garantiert kundenbetreuer_id-Konsistenz).
  // fall_id statt id, fall_status statt status, fall_created_at statt created_at.
  const { data: faelle, error: faelleErr } = await db
    .from('v_claim_full')
    .select('fall_id, claim_nummer, lead_id, kundenbetreuer_id, fall_created_at, vollmacht_signiert_am, mandatsnummer')
    .eq('service_typ', 'komplett')
    .not('fall_status', 'in', '("abgeschlossen","storniert")')
    .is('vollmacht_signiert_am', null)

  if (faelleErr) {
    console.error('[vollmacht-reminder] faelle query:', faelleErr.message)
    return NextResponse.json({ error: faelleErr.message }, { status: 500 })
  }

  if (!faelle?.length) {
    return NextResponse.json({ checked: 0, reminders: 0, tasks: 0 })
  }

  // Nur Fälle mit einem aktiven reservierten Termin
  const fallIds = faelle.map(f => f.fall_id as string)
  const { data: reservierteTermine, error: termineErr } = await db
    .from('gutachter_termine')
    .select('fall_id')
    .in('fall_id', fallIds)
    .eq('status', 'reserviert')

  if (termineErr) {
    console.error('[vollmacht-reminder] termine query:', termineErr.message)
  }

  const fallsWithTermin = new Set((reservierteTermine ?? []).map(t => t.fall_id as string))

  let reminders = 0
  let tasks = 0

  for (const fall of faelle) {
    if (!fallsWithTermin.has(fall.fall_id as string)) continue // Kein reservierter Termin

    const createdAt = new Date(fall.fall_created_at as string)
    const ageMs = now.getTime() - createdAt.getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)

    const isDay1 = ageDays >= 1 && ageDays < 2
    const isDay3 = ageDays >= 3 && ageDays < 4
    const isDay7Plus = ageDays >= 7

    if (!isDay1 && !isDay3 && !isDay7Plus) continue

    // Idempotenz-Check via Timeline
    const reminderTyp = isDay7Plus ? 'vollmacht_task' : isDay3 ? 'vollmacht_reminder_2' : 'vollmacht_reminder_1'

    const { count: existing } = await db
      .from('timeline')
      .select('id', { count: 'exact', head: true })
      .eq('fall_id', fall.fall_id as string)
      .eq('typ', reminderTyp)

    if (existing && existing > 0) continue // Bereits gesendet

    if (isDay7Plus) {
      // 2026-05-11: Auto-Re-Push wenn initialer Push hat keinen mandatsnummer
      // hinterlassen — bedeutet LexDrive-Side hat das Mandat nie erhalten.
      // pushMandatToKanzlei ist idempotent (X-Claimondo-Event-Id pro Aufruf).
      if (!fall.mandatsnummer) {
        try {
          const { pushMandatToKanzlei } = await import('@/lib/kanzlei/push-mandat')
          const result = await pushMandatToKanzlei(fall.fall_id as string)
          await db.from('timeline').insert({
            fall_id: fall.fall_id as string,
            typ: 'webhook',
            titel: result.success
              ? 'Mandat-Re-Push (Auto): erfolgreich'
              : `Mandat-Re-Push (Auto): fehlgeschlagen — ${result.error ?? 'unbekannt'}`,
            beschreibung: `Tag-7+-Retry: initialer Push hatte keine mandatsnummer hinterlassen.`,
          })
        } catch (err) {
          console.warn('[vollmacht-reminder] Auto-Re-Push:', err)
        }
      }

      // Admin-Task erstellen
      const { error: taskErr } = await db.from('tasks').insert({
        fall_id: fall.fall_id as string,
        titel: 'Vollmacht ausstehend — Kunde kontaktieren',
        beschreibung: `Fall ${fall.claim_nummer ?? (fall.fall_id as string).slice(0, 8)}: Vollmacht seit ${Math.floor(ageDays)} Tagen nicht unterschrieben. Bitte Kunden direkt kontaktieren.`,
        typ: 'vollmacht_ausstehend',
        status: 'offen',
        prioritaet: 'dringend',
        auto_erstellt: true,
        faellig_am: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        empfaenger_user_id: (fall.kundenbetreuer_id as string) ?? null,
      })

      if (taskErr) {
        console.error('[vollmacht-reminder] task insert:', taskErr.message)
        continue
      }

      // Timeline-Marker für Idempotenz
      await db.from('timeline').insert({
        fall_id: fall.fall_id as string,
        typ: reminderTyp,
        titel: 'Admin-Task: Vollmacht ausstehend (7+ Tage)',
        beschreibung: `Automatisch erstellt nach ${Math.floor(ageDays)} Tagen ohne Vollmacht-Unterschrift.`,
      })

      tasks++
    } else {
      // WhatsApp-Reminder an Kunden
      const reminderNr = isDay3 ? '2.' : '1.'
      let gesendet = false
      if (fall.lead_id) {
        const { data: lead } = await db
          .from('leads')
          .select('telefon, vorname')
          .eq('id', fall.lead_id as string)
          .single()

        if (lead?.telefon) {
          try {
            const { sendCommunication } = await import('@/lib/communications/send')
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cmndo.vercel.app'
            await sendCommunication('dokumente_nachreichen', {
              telefon: lead.telefon,
              vorname: lead.vorname ?? 'Kunde',
              '1': lead.vorname ?? 'Kunde',
              '2': `Vollmacht für Fall ${fall.claim_nummer ?? (fall.fall_id as string).slice(0, 8)}`,
              '3': `${appUrl}/kunde`,
            })
            gesendet = true
          } catch (err) {
            console.error('[vollmacht-reminder] WhatsApp:', err)
          }
        }
      }

      // Timeline-Marker für Idempotenz (auch wenn WhatsApp fehlschlug)
      await db.from('timeline').insert({
        fall_id: fall.fall_id as string,
        typ: reminderTyp,
        titel: `Vollmacht-Reminder ${reminderNr} gesendet`,
        beschreibung: gesendet
          ? `WhatsApp-Reminder an Kunden gesendet (Tag ${Math.floor(ageDays)}).`
          : `Reminder-Versuch (Tag ${Math.floor(ageDays)}) — kein WhatsApp möglich.`,
      })

      reminders++
    }
  }

  console.log(`[KFZ-192] vollmacht-reminder: ${faelle.length} geprüft, ${reminders} Reminder, ${tasks} Tasks`)

  return NextResponse.json({
    checked: faelle.length,
    withTermin: fallsWithTermin.size,
    reminders,
    tasks,
  })
}
