import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { render } from '@react-email/render'
import { sendEmail } from '@/lib/email/google/client'
import { AbrechnungReminderEmail, subject as reminderSubject } from '@/lib/email/google/templates/AbrechnungReminder'

export const dynamic = 'force-dynamic'

type ReminderTier = 'reminder_7d' | 'reminder_3d' | 'reminder_1d'

/**
 * KFZ-149 Hund-D: 3-stufige Reminder-Kadenz fuer SV-Monatsabrechnungen.
 *
 * Schedule (vercel.json): 0 7 * * *  — taeglich 07:00 UTC = 09:00 deutsche Zeit
 *
 * Drei Erinnerungs-Stufen pro Abrechnung, deduped via abrechnung_reminders Tabelle:
 *   - T-7 (reminder_7d) : 7 Tage vor Faelligkeit, sanfter erster Hinweis
 *   - T-3 (reminder_3d) : 3 Tage vor Faelligkeit, zweite Erinnerung
 *   - T-1 (reminder_1d) : 1 Tag vor Faelligkeit, finaler Hinweis vor Auto-Einzug
 *
 * Der naechste Cron-Lauf abrechnung-einzug (08:00 UTC) zieht dann die faelligen
 * Posten ab. Pro (abrechnung_id, reminder_typ) wird dank UNIQUE-Index nur einmal
 * gemailt — auch wenn der Cron versehentlich mehrfach laeuft.
 *
 * Idempotenz-Spalte abrechnungen.reminder_gesendet_am wird zusaetzlich auf
 * den juengsten Versand gesetzt fuer schnelle 'wann zuletzt erinnert' Filter
 * im Admin-Listing (legacy Pfad — die Tier-History lebt in abrechnung_reminders).
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  const heute = new Date()
  // Wir holen alle Abrechnungen mit Faelligkeit zwischen jetzt und in 7 Tagen
  // (plus offene noch nicht eingezogene), pro Eintrag berechnen wir die Tier.
  const inSiebenTagen = new Date(heute.getTime() + 7 * 24 * 60 * 60 * 1000)
  const grenzDatum = inSiebenTagen.toISOString().slice(0, 10)

  const { data: faellig, error } = await db
    .from('abrechnungen')
    .select('id, abrechnungs_nr, empfaenger_typ, empfaenger_id, empfaenger_email, empfaenger_name, summe_brutto, faellig_am')
    .eq('empfaenger_typ', 'sv')
    .is('bezahlt_am', null)
    .is('storniert_am', null)
    .not('faellig_am', 'is', null)
    .lte('faellig_am', grenzDatum)

  if (error) {
    console.error('[KFZ-149 reminder] Query-Fehler:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const counts: Record<ReminderTier, number> = { reminder_7d: 0, reminder_3d: 0, reminder_1d: 0 }
  let skipped = 0
  let failed = 0

  for (const abr of faellig ?? []) {
    if (!abr.empfaenger_email || !abr.faellig_am) { skipped++; continue }

    // Berechne Tage bis Faelligkeit (negative Werte = ueberfaellig)
    const faelligDate = new Date(abr.faellig_am as string)
    const tageBisFaellig = Math.floor(
      (faelligDate.getTime() - heute.getTime()) / (24 * 60 * 60 * 1000),
    )

    // Bestimme die hoechste passende Tier (T-1 hat Vorrang vor T-3 vor T-7).
    // Ueberfaellig (tageBisFaellig < 0) -> auch T-1 (letzter Reminder bevor Einzug),
    // damit ueberfaellige Posten nicht stillschweigend untergehen.
    let tier: ReminderTier | null = null
    if (tageBisFaellig <= 1) tier = 'reminder_1d'
    else if (tageBisFaellig <= 3) tier = 'reminder_3d'
    else if (tageBisFaellig <= 7) tier = 'reminder_7d'

    if (!tier) { skipped++; continue }

    // Wurde diese Tier fuer diese Abrechnung schon versendet?
    const { data: existing } = await db.from('abrechnung_reminders')
      .select('id')
      .eq('abrechnung_id', abr.id)
      .eq('reminder_typ', tier)
      .limit(1)
      .maybeSingle()

    if (existing) { skipped++; continue }

    // Vorname aus Profile lookup (best effort)
    let vorname: string | null = null
    let nachname: string | null = null
    if (abr.empfaenger_id) {
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

    try {
      const props = {
        vorname,
        nachname,
        abrechnungs_nr: abr.abrechnungs_nr,
        summe_brutto: Number(abr.summe_brutto ?? 0),
        faellig_am: abr.faellig_am as string,
        tage_bis_faellig: Math.max(0, tageBisFaellig),
      }
      const html = await render(AbrechnungReminderEmail(props))
      await sendEmail({
        to: abr.empfaenger_email,
        subject: reminderSubject(props),
        html,
        empfaengerTyp: 'sv',
        template: `abrechnung_${tier}`,
      })

      // Audit-Trail: Tier in abrechnung_reminders + legacy reminder_gesendet_am setzen
      const versendetAm = new Date().toISOString()
      await db.from('abrechnung_reminders').insert({
        abrechnung_id: abr.id,
        reminder_typ: tier,
        versendet_am: versendetAm,
        details: { tage_bis_faellig: tageBisFaellig, summe_brutto: Number(abr.summe_brutto ?? 0) },
      })
      await db.from('abrechnungen').update({
        reminder_gesendet_am: versendetAm,
      }).eq('id', abr.id)

      counts[tier]++
    } catch (err) {
      console.error(`[KFZ-149 reminder] ${tier} Mail fuer ${abr.abrechnungs_nr} fehlgeschlagen:`, err)
      failed++
    }
  }

  console.log(`[KFZ-149 reminder] T-7=${counts.reminder_7d} T-3=${counts.reminder_3d} T-1=${counts.reminder_1d} skipped=${skipped} failed=${failed} total_pruefung=${faellig?.length ?? 0}`)
  return NextResponse.json({
    ok: true,
    sent: counts.reminder_7d + counts.reminder_3d + counts.reminder_1d,
    by_tier: counts,
    skipped,
    failed,
    total: faellig?.length ?? 0,
  })
}
