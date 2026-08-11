import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { reminderStufeNachAlter } from '@/lib/cron/reminder-stufe'
import { enqueue, buildDedupKey } from '@/lib/notifications/outbox'

/**
 * B1 (CMM Phase 1.5e): SA-Reminder Cron.
 *
 * Läuft täglich um 10:00 (gleicher Slot wie vollmacht-reminder).
 *
 * Filter: alle Fälle die noch keine SA-Unterschrift haben (sa_unterschrieben_am IS NULL)
 * und nicht bereits abgeschlossen oder storniert sind.
 *
 * Eskalation:
 *   - Tag 1 → erster WhatsApp-Reminder an Kunden
 *   - Tag 3 → zweiter WhatsApp-Reminder
 *   - Tag 5+ → Admin-Task für KB („Kunde direkt kontaktieren")
 *
 * Idempotenz: Timeline-Eintrag mit reminderTyp als Marker, doppelte
 * Sends werden übersprungen. Analog zum Vollmacht-Pattern (KFZ-192).
 *
 * Warum 5 Tage statt 7 wie bei Vollmacht: SA blockiert die Termin-Buchung
 * komplett — ohne SA kann der SV nicht erscheinen, der Kunde merkt das
 * direkt. Frühere Eskalation als bei Vollmacht (die nur die LexDrive-
 * Übergabe blockiert).
 */

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()

  // CMM-47 A.2: faelle → v_claim_full (Sync-Trigger garantiert kundenbetreuer_id-Konsistenz).
  // fall_id statt id (id wäre claim.id), fall_status statt status (claims.status ≠ faelle.status),
  // fall_created_at statt created_at.
  const { data: faelle, error: faelleErr } = await db
    .from('v_claim_full')
    .select('fall_id, claim_nummer, lead_id, kundenbetreuer_id, fall_created_at, sa_unterschrieben_am')
    .neq('main_phase', 'abschluss')
    .is('sa_unterschrieben_am', null)

  if (faelleErr) {
    console.error('[sa-reminder] faelle query:', faelleErr.message)
    return NextResponse.json({ error: faelleErr.message }, { status: 500 })
  }

  if (!faelle?.length) {
    return NextResponse.json({ checked: 0, reminders: 0, tasks: 0 })
  }

  let reminders = 0
  let tasks = 0

  for (const fall of faelle) {
    const createdAt = new Date(fall.fall_created_at as string)
    const ageMs = now.getTime() - createdAt.getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)

    // AAR (06.07. Cron-Hunt): Nachhol-Fenster statt fester [1,2)/[3,4)-Fenster — sonst
    // wird eine Reminder-Stufe bei ausgefallenem/verspaetetem Cron-Lauf dauerhaft
    // uebersprungen. Der Timeline-Idempotenz-Check unten verhindert weiter Doppel-Sends.
    const stufe = reminderStufeNachAlter(ageDays, 3, 5)
    if (stufe === null) continue
    const isDay1 = stufe === 'stufe1'
    const isDay3 = stufe === 'stufe2'
    const isDay5Plus = stufe === 'stufe3'

    const reminderTyp = isDay5Plus
      ? 'sa_task'
      : isDay3
        ? 'sa_reminder_2'
        : 'sa_reminder_1'

    // Idempotenz-Check
    const { count: existing } = await db
      .from('timeline')
      .select('id', { count: 'exact', head: true })
      .eq('fall_id', fall.fall_id as string)
      .eq('typ', reminderTyp)

    if (existing && existing > 0) continue

    if (isDay5Plus) {
      const { error: taskErr } = await db.from('tasks').insert({
        fall_id: fall.fall_id as string,
        titel: 'SA ausstehend — Kunde direkt kontaktieren',
        beschreibung: `Fall ${fall.claim_nummer ?? (fall.fall_id as string).slice(0, 8)}: Schadensanzeige seit ${Math.floor(ageDays)} Tagen nicht unterschrieben. Termin kann nicht gebucht werden — bitte Kunden anrufen.`,
        typ: 'sa_ausstehend',
        status: 'offen',
        prioritaet: 'dringend',
        auto_erstellt: true,
        faellig_am: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        empfaenger_user_id: (fall.kundenbetreuer_id as string) ?? null,
      })

      if (taskErr) {
        console.error('[sa-reminder] task insert:', taskErr.message)
        continue
      }

      await db.from('timeline').insert({
        fall_id: fall.fall_id as string,
        typ: reminderTyp,
        titel: 'Admin-Task: SA ausstehend (5+ Tage)',
        beschreibung: `Automatisch erstellt nach ${Math.floor(ageDays)} Tagen ohne SA-Unterschrift.`,
      })

      tasks++
    } else {
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
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
            // C3a: durable via Notification-Outbox (Retry-Backoff + Dead-Letter statt
            // stillem console.error — der Reminder ging bisher bei einem Twilio-
            // Aussetzer verloren, und die Timeline-Idempotenz darunter verhindert
            // jeden Nachschuss).
            // Der Empfaengerkreis bleibt EXAKT gleich: die lead.telefon-Guard oben
            // bleibt stehen, und sendFallCommunication resolved denselben Kunden
            // (claims.lead_id -> leads.telefon).
            // dedupKey mit Cron-Diskriminator + Reminder-Stufe: 'dokumente_nachreichen'
            // wird von DREI Crons (sa/vollmacht/pflichtdokumente) + konditional-tasks +
            // sv-termin-reminder gesendet — ein gemeinsames Fenster wuerde sie
            // gegenseitig deduplizieren.
            const res = await enqueue({
              dedupKey: buildDedupKey({
                template: 'dokumente_nachreichen',
                claimId: fall.fall_id as string,
                fenster: `sa-${reminderNr}`,
              }),
              kanal: 'whatsapp',
              template: 'dokumente_nachreichen',
              claimId: fall.fall_id as string,
              payload: {
                '1': lead.vorname ?? 'Kunde',
                '2': `Schadensanzeige für Fall ${fall.claim_nummer ?? (fall.fall_id as string).slice(0, 8)}`,
                '3': `${appUrl}/kunde`,
              },
            })
            gesendet = res.ok
          } catch (err) {
            console.error('[sa-reminder] Outbox-enqueue:', err)
          }
        }
      }

      await db.from('timeline').insert({
        fall_id: fall.fall_id as string,
        typ: reminderTyp,
        titel: `SA-Reminder ${reminderNr} gesendet`,
        beschreibung: gesendet
          ? `WhatsApp-Reminder an Kunden gesendet (Tag ${Math.floor(ageDays)}).`
          : `Reminder-Versuch (Tag ${Math.floor(ageDays)}) — kein WhatsApp möglich.`,
      })

      reminders++
    }
  }

  console.log(`[B1] sa-reminder: ${faelle.length} geprüft, ${reminders} Reminder, ${tasks} Tasks`)

  return NextResponse.json({
    checked: faelle.length,
    reminders,
    tasks,
  })
}
