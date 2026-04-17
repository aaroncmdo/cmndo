import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFallCommunication } from '@/lib/communications/send-fall'

// AAR-354: SV-Termin-Dokument-Reminder.
// Läuft täglich um 09:00 CET (07:00 UTC). Sucht alle bestätigten SV-Termine
// im Fenster [now+20h, now+28h]. Für jeden Termin prüft, ob Pflichtdokumente
// (pflicht=true, dokument_url IS NULL) am Fall offen sind. Wenn ja → WhatsApp
// via Template `dokumente_nachreichen` an den Kunden, und setzt das Flag
// faelle.sv_termin_dokument_reminder_gesendet_am auf now. Der Flag verhindert
// doppelte Sendungen pro Fall (ein SV-Termin pro Fall ist der Normalfall).
//
// Abgrenzung:
// - /api/cron/termin-erinnerungen enthält einen 48h-Doc-Check, der aber nur
//   einen nachrichten-Eintrag schreibt und kein Twilio-Template triggert.
// - /api/cron/pflichtdokumente-reminder läuft alle 4h, täglich, über alle
//   offenen Fälle — NICHT termin-gebunden.
// Dieser Cron adressiert explizit die 24h-vor-Termin-Situation aus AAR-354.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  const in20h = new Date(now.getTime() + 20 * 60 * 60 * 1000).toISOString()
  const in28h = new Date(now.getTime() + 28 * 60 * 60 * 1000).toISOString()

  // SV-Termine im Fenster [+20h, +28h], nur bestätigte.
  const { data: termine } = await db
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit')
    .gte('start_zeit', in20h)
    .lte('start_zeit', in28h)
    .in('status', ['bestaetigt', 'reserviert'])
    .not('fall_id', 'is', null)

  let geprueft = 0
  let gesendet = 0
  let skippedKeineDocs = 0
  let skippedBereitsGesendet = 0

  for (const termin of termine ?? []) {
    geprueft++
    if (!termin.fall_id) continue

    // Fall + Flag laden
    const { data: fall } = await db
      .from('faelle')
      .select('id, fall_nummer, sv_termin_dokument_reminder_gesendet_am')
      .eq('id', termin.fall_id)
      .single()
    if (!fall) continue

    if (fall.sv_termin_dokument_reminder_gesendet_am) {
      skippedBereitsGesendet++
      continue
    }

    // Offene Pflichtdokumente (pflicht=true, noch keine URL)
    const { data: offen } = await db
      .from('pflichtdokumente')
      .select('dokument_typ')
      .eq('fall_id', fall.id as string)
      .eq('pflicht', true)
      .is('dokument_url', null)

    if (!offen || offen.length === 0) {
      skippedKeineDocs++
      continue
    }

    // Labels aus Katalog für freundliche Auflistung
    const slotIds = Array.from(new Set(offen.map(o => o.dokument_typ as string)))
    const { data: katalog } = await db
      .from('dokument_katalog')
      .select('slot_id, label')
      .in('slot_id', slotIds)
    const labelMap = new Map<string, string>(
      (katalog ?? []).map(k => [k.slot_id as string, k.label as string]),
    )
    const labels = slotIds.map(id => labelMap.get(id) ?? id).join(', ')

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cmndo.vercel.app'
    const uploadLink = `${appUrl}/kunde/onboarding?step=dokumente`

    try {
      // extraData-Keys überschreiben resolved vorname aus send-fall.ts:75 —
      // deshalb '1' NICHT setzen, damit der Vorname korrekt eingesetzt wird.
      await sendFallCommunication(fall.id as string, 'dokumente_nachreichen', {
        '2': labels,
        '3': uploadLink,
      })

      // Timeline-Eintrag
      await db.from('timeline').insert({
        fall_id: fall.id as string,
        typ: 'whatsapp',
        titel: 'WhatsApp: Fehlende Dokumente (24h vor SV-Termin)',
        beschreibung: `${offen.length} Pflichtdokument(e) offen: ${labels}`,
      })

      // Flag setzen — verhindert doppelten Versand
      await db.from('faelle')
        .update({ sv_termin_dokument_reminder_gesendet_am: now.toISOString() })
        .eq('id', fall.id as string)

      gesendet++
    } catch (err) {
      console.error(`[AAR-354] SV-Termin-Doc-Reminder fehlgeschlagen für Fall ${fall.id}:`, err)
    }
  }

  console.log(`[AAR-354] sv-termin-dokument-reminder: ${geprueft} Termine, ${gesendet} gesendet, ${skippedKeineDocs} ohne offene Docs, ${skippedBereitsGesendet} bereits gesendet`)

  return NextResponse.json({
    ok: true,
    geprueft,
    gesendet,
    skipped_keine_docs: skippedKeineDocs,
    skipped_bereits_gesendet: skippedBereitsGesendet,
    checked_at: now.toISOString(),
  })
}
