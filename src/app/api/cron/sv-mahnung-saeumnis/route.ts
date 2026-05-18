import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { render } from '@react-email/render'
import { SvMahnungSaeumnisEmail, subject as mahnungSubject } from '@/lib/email/google/templates/SvMahnungSaeumnis'

export const dynamic = 'force-dynamic'

/**
 * AAR-927: Post-Faelligkeit-Mahnung fuer SV-Abrechnungen.
 *
 * Pre-Faelligkeit-Reminders (T-7/T-3/T-1) sitzen in cron/abrechnung-reminder.
 * Lastschrift-Einzug am Faelligkeitstag laeuft in cron/abrechnung-einzug.
 * Dieser Cron faengt ab, was nach Einzug NICHT bezahlt wurde.
 *
 * Eskalations-Stufen (Tage ueberfaellig):
 *   - 14d: mahnung_14d   (erste Erinnerung nach Verzug)
 *   - 21d: mahnung_21d   (zweite Mahnung mit Portal-Zugang-Drohung)
 *   - 28d: mahnung_28d   (letzte Mahnung mit Inkasso-Drohung)
 *
 * Idempotenz: pro (abrechnung_id, reminder_typ) wird nur einmal gemailt —
 * Pre-Check via SELECT auf abrechnung_reminders, Pattern wie cron/abrechnung-reminder.
 *
 * Admin-Notification (CC an Aaron) fuer Eskalations-Stufe mahnung_28d, damit
 * eine manuelle Inkasso-Entscheidung getriggert werden kann.
 *
 * Schedule (VPS-Crontab): taeglich 08:00 deutsche Zeit.
 */

type Stufe = 'mahnung_14d' | 'mahnung_21d' | 'mahnung_28d'

const STUFEN: Array<{ tage_min: number; tage_max: number; typ: Stufe }> = [
  { tage_min: 28, tage_max: Infinity, typ: 'mahnung_28d' },
  { tage_min: 21, tage_max: 28, typ: 'mahnung_21d' },
  { tage_min: 14, tage_max: 21, typ: 'mahnung_14d' },
]

function bestimmeStufe(tageUeberfaellig: number): Stufe | null {
  for (const s of STUFEN) {
    if (tageUeberfaellig >= s.tage_min && tageUeberfaellig < s.tage_max) return s.typ
  }
  return null
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const heute = new Date()
  const grenzDatum = new Date(heute.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Alle SV-Abrechnungen die seit mind. 14 Tagen ueberfaellig sind und nicht bezahlt/storniert
  const { data: faellig, error } = await db
    .from('abrechnungen')
    .select('id, abrechnungs_nr, empfaenger_email, empfaenger_name, summe_brutto, faellig_am')
    .eq('empfaenger_typ', 'sv')
    .is('bezahlt_am', null)
    .is('storniert_am', null)
    .not('faellig_am', 'is', null)
    .lte('faellig_am', grenzDatum)

  if (error) {
    console.error('[AAR-927] sv-mahnung-saeumnis Query-Fehler:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const counts: Record<Stufe, number> = { mahnung_14d: 0, mahnung_21d: 0, mahnung_28d: 0 }
  let skipped = 0
  let failed = 0

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'aaron.sprafke@claimondo.de'

  for (const abr of faellig ?? []) {
    if (!abr.empfaenger_email || !abr.faellig_am) { skipped++; continue }

    const faelligDate = new Date(abr.faellig_am as string)
    const tageUeberfaellig = Math.floor((heute.getTime() - faelligDate.getTime()) / (24 * 60 * 60 * 1000))
    const stufe = bestimmeStufe(tageUeberfaellig)
    if (!stufe) { skipped++; continue }

    // Idempotenz: Stufe schon versendet?
    const { data: existing } = await db.from('abrechnung_reminders')
      .select('id')
      .eq('abrechnung_id', abr.id)
      .eq('reminder_typ', stufe)
      .limit(1)
      .maybeSingle()
    if (existing) { skipped++; continue }

    // Vorname aus empfaenger_name extrahieren (vorname nachname-Format)
    const vorname = (abr.empfaenger_name as string | null)?.split(' ')[0] ?? null

    const emailProps = {
      vorname,
      abrechnungs_nr: abr.abrechnungs_nr as string,
      summe_brutto: Number(abr.summe_brutto ?? 0),
      faellig_am: abr.faellig_am as string,
      tage_ueberfaellig: tageUeberfaellig,
      stufe,
    }

    // Email an SV — wenn Send fehlschlaegt, Reminder nicht persistieren damit
    // naechster Cron-Lauf nochmal versucht.
    try {
      const html = await render(SvMahnungSaeumnisEmail(emailProps))
      const { sendEmail } = await import('@/lib/email/google/client')
      await sendEmail({
        to: abr.empfaenger_email as string,
        subject: mahnungSubject(emailProps),
        html,
        template: 'sv_mahnung_saeumnis',
        empfaengerTyp: 'sv',
      })
    } catch (err) {
      console.error(`[AAR-927] Email-Send fehlgeschlagen (abrechnung_id=${abr.id}):`, err)
      failed++
      continue
    }

    // Audit-Trail
    await db.from('abrechnung_reminders').insert({
      abrechnung_id: abr.id,
      reminder_typ: stufe,
      versendet_am: heute.toISOString(),
      details: { tage_ueberfaellig: tageUeberfaellig, summe_brutto: Number(abr.summe_brutto ?? 0) },
    })

    // Admin-Notification bei finaler Stufe — Inkasso-Entscheidung
    if (stufe === 'mahnung_28d') {
      try {
        const { sendEmail } = await import('@/lib/email/google/client')
        await sendEmail({
          to: adminEmail,
          subject: `[Inkasso-Entscheidung] SV-Abrechnung ${abr.abrechnungs_nr} — 28d überfällig`,
          html: `<p>Hallo Aaron,</p>
<p>die SV-Abrechnung <strong>${abr.abrechnungs_nr}</strong> (${abr.empfaenger_name ?? '–'}, ${abr.empfaenger_email ?? '–'}) ist seit <strong>${tageUeberfaellig} Tagen</strong> überfällig und hat die finale Mahnungs-Stufe erreicht.</p>
<p>Bitte entscheide manuell ob der Vorgang an Inkasso übergeben wird oder ob der Portal-Zugang ausgesetzt wird.</p>
<p>Endbetrag: ${Number(abr.summe_brutto ?? 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
<p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'}/admin/finance">Zur Admin-Finance-Hub</a></p>`,
          template: 'admin_mahnung_eskalation',
          empfaengerTyp: 'admin',
        })
      } catch (err) {
        console.error('[AAR-927] Admin-Notification fehlgeschlagen (non-critical):', err)
      }
    }

    counts[stufe]++
  }

  console.log(`[AAR-927] sv-mahnung-saeumnis: 14d=${counts.mahnung_14d} 21d=${counts.mahnung_21d} 28d=${counts.mahnung_28d} skipped=${skipped} failed=${failed} total=${faellig?.length ?? 0}`)
  return NextResponse.json({
    ok: true,
    sent: counts.mahnung_14d + counts.mahnung_21d + counts.mahnung_28d,
    by_stufe: counts,
    skipped,
    failed,
    total: faellig?.length ?? 0,
  })
}
