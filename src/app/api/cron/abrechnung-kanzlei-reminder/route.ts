import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/google/client'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'

/**
 * KFZ-188: Reminder-Cron fuer Kanzlei-Abrechnungen.
 *
 * Schedule (vercel.json): 0 9 * * * — taeglich 09:00 UTC
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Kadenz (bezogen auf faelligkeitsdatum):
 *   T-9  (day_5)  : Freundliche erste Erinnerung
 *   T-4  (day_10) : Zweite Erinnerung
 *   T-1  (day_13) : Letzter Tag Warnung
 *   T+1  (mahnung_1): Mahnung 1 (1 Tag ueberfaellig)
 *   T+7  (mahnung_2): Mahnung 2 + Eskalation (7 Tage ueberfaellig)
 *
 * Idempotenz via kanzlei_abrechnung_reminders (UNIQUE auf abrechnung+typ).
 */

type ReminderTyp = 'day_5' | 'day_10' | 'day_13' | 'mahnung_1' | 'mahnung_2'

interface ReminderConfig {
  typ: ReminderTyp
  tageBisFaellig: number   // positiv = vor Faelligkeit, negativ = nach Faelligkeit
  subject: string
  bodyFn: (data: { kanzleiName: string; ansprechpartner: string; rechnungsnummer: string; brutto: string; faelligAm: string; magicUrl: string }) => string
}

const REMINDER_CONFIGS: ReminderConfig[] = [
  {
    typ: 'day_5',
    tageBisFaellig: 9,
    subject: 'Erinnerung: Claimondo Rechnung faellig in 9 Tagen',
    bodyFn: ({ kanzleiName, ansprechpartner, rechnungsnummer, brutto, faelligAm, magicUrl }) =>
      `<p>Hallo ${ansprechpartner},</p><p>wir moechten Sie freundlich daran erinnern, dass Ihre Rechnung <strong>${rechnungsnummer}</strong> ueber <strong>${brutto}</strong> am <strong>${faelligAm}</strong> faellig wird.</p><p><a href="${magicUrl}" style="display:inline-block;padding:10px 20px;background:#0D1B3E;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Rechnung aufrufen &amp; bezahlen</a></p><p>Mit freundlichen Gruessen,<br>Ihr Claimondo-Team</p>`,
  },
  {
    typ: 'day_10',
    tageBisFaellig: 4,
    subject: 'Erinnerung: Claimondo Rechnung faellig in 4 Tagen',
    bodyFn: ({ ansprechpartner, rechnungsnummer, brutto, faelligAm, magicUrl }) =>
      `<p>Hallo ${ansprechpartner},</p><p>Ihre Rechnung <strong>${rechnungsnummer}</strong> ueber <strong>${brutto}</strong> ist am <strong>${faelligAm}</strong> faellig. Bitte begleichen Sie den Betrag rechtzeitig.</p><p><a href="${magicUrl}" style="display:inline-block;padding:10px 20px;background:#0D1B3E;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Jetzt bezahlen</a></p><p>Mit freundlichen Gruessen,<br>Ihr Claimondo-Team</p>`,
  },
  {
    typ: 'day_13',
    tageBisFaellig: 1,
    subject: 'LETZTE ERINNERUNG: Claimondo Rechnung morgen faellig',
    bodyFn: ({ ansprechpartner, rechnungsnummer, brutto, faelligAm, magicUrl }) =>
      `<p>Hallo ${ansprechpartner},</p><p><strong>Letzte Erinnerung:</strong> Ihre Rechnung <strong>${rechnungsnummer}</strong> ueber <strong>${brutto}</strong> ist morgen am <strong>${faelligAm}</strong> faellig.</p><p><a href="${magicUrl}" style="display:inline-block;padding:10px 20px;background:#0D1B3E;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Jetzt bezahlen</a></p><p>Mit freundlichen Gruessen,<br>Ihr Claimondo-Team</p>`,
  },
  {
    typ: 'mahnung_1',
    tageBisFaellig: -1,
    subject: 'MAHNUNG: Claimondo Rechnung ueberfaellig',
    bodyFn: ({ ansprechpartner, rechnungsnummer, brutto, faelligAm, magicUrl }) =>
      `<p>Hallo ${ansprechpartner},</p><p>leider haben wir noch keinen Zahlungseingang fuer Rechnung <strong>${rechnungsnummer}</strong> ueber <strong>${brutto}</strong> festgestellt. Die Rechnung war am <strong>${faelligAm}</strong> faellig.</p><p>Bitte begleichen Sie den Betrag umgehend.</p><p><a href="${magicUrl}" style="display:inline-block;padding:10px 20px;background:#c0392b;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Jetzt bezahlen</a></p><p>Bei Fragen melden Sie sich bitte unter support@claimondo.de.</p><p>Mit freundlichen Gruessen,<br>Ihr Claimondo-Team</p>`,
  },
  {
    typ: 'mahnung_2',
    tageBisFaellig: -7,
    subject: 'LETZTE MAHNUNG: Claimondo Rechnung 7 Tage ueberfaellig',
    bodyFn: ({ ansprechpartner, rechnungsnummer, brutto, faelligAm, magicUrl }) =>
      `<p>Hallo ${ansprechpartner},</p><p>Ihre Rechnung <strong>${rechnungsnummer}</strong> ueber <strong>${brutto}</strong> (faellig: ${faelligAm}) ist nunmehr 7 Tage ueberfaellig. Dies ist unsere letzte Mahnung vor Weitergabe an unsere Rechtsabteilung.</p><p>Bitte begleichen Sie den Betrag sofort.</p><p><a href="${magicUrl}" style="display:inline-block;padding:10px 20px;background:#c0392b;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Jetzt bezahlen</a></p><p>Mit freundlichen Gruessen,<br>Ihr Claimondo-Team</p>`,
  },
]

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const heute = new Date()
  // Fenster: alles was in den naechsten 10 Tagen faellig ist oder bis zu 14 Tage ueberfaellig
  const fensterende = new Date(heute.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const fensterstart = new Date(heute.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: abrechnungen, error } = await db
    .from('kanzlei_abrechnungen')
    .select('id, rechnungsnummer, endbetrag_brutto, faelligkeitsdatum, magic_link_token, kanzlei_id')
    .eq('status', 'versendet')
    .not('faelligkeitsdatum', 'is', null)
    .gte('faelligkeitsdatum', fensterstart)
    .lte('faelligkeitsdatum', fensterende)

  if (error) {
    console.error('[KFZ-188 reminder] Query-Fehler:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let gesendet = 0
  let uebersprungen = 0
  let fehlgeschlagen = 0

  for (const abr of abrechnungen ?? []) {
    if (!abr.faelligkeitsdatum || !abr.magic_link_token) {
      uebersprungen++
      continue
    }

    const faelligDate = new Date(abr.faelligkeitsdatum as string)
    const tageBisFaellig = Math.floor(
      (faelligDate.getTime() - heute.getTime()) / (24 * 60 * 60 * 1000),
    )

    // Kanzlei-Daten laden
    const { data: kanzlei } = await db
      .from('kanzleien')
      .select('name, email, ansprechpartner')
      .eq('id', abr.kanzlei_id)
      .maybeSingle()

    if (!kanzlei?.email) {
      uebersprungen++
      continue
    }

    for (const cfg of REMINDER_CONFIGS) {
      // Pruefe ob dieser Reminder jetzt faellig ist
      // Erlaubtes Fenster: tageBisFaellig <= cfg.tageBisFaellig
      // und tageBisFaellig > naechster_schwellenwert (um nicht zu springen)
      const istFaellig = tageBisFaellig <= cfg.tageBisFaellig

      if (!istFaellig) continue

      // Idempotenz: schon gesendet?
      const { data: vorhandener } = await db
        .from('kanzlei_abrechnung_reminders')
        .select('id')
        .eq('kanzlei_abrechnung_id', abr.id)
        .eq('reminder_typ', cfg.typ)
        .limit(1)
        .maybeSingle()

      if (vorhandener) continue

      const magicUrl = `${APP_URL}/kanzlei/abrechnung/${abr.magic_link_token}`
      const bruttoStr = `${Number(abr.endbetrag_brutto).toFixed(2).replace('.', ',')} €`
      const faelligAmStr = new Date(abr.faelligkeitsdatum as string).toLocaleDateString('de-DE')

      const bodyData = {
        kanzleiName: kanzlei.name,
        ansprechpartner: kanzlei.ansprechpartner ?? 'Sehr geehrte Damen und Herren',
        rechnungsnummer: abr.rechnungsnummer as string,
        brutto: bruttoStr,
        faelligAm: faelligAmStr,
        magicUrl,
      }

      try {
        await sendEmail({
          to: kanzlei.email,
          subject: cfg.subject,
          html: cfg.bodyFn(bodyData),
          empfaengerTyp: 'kanzlei',
          template: `kanzlei_abrechnung_${cfg.typ}`,
        })

        await db.from('kanzlei_abrechnung_reminders').insert({
          kanzlei_abrechnung_id: abr.id,
          reminder_typ: cfg.typ,
          gesendet_am: new Date().toISOString(),
        })

        gesendet++
        console.log(`[KFZ-188 reminder] ${cfg.typ} fuer ${abr.rechnungsnummer} gesendet`)
      } catch (err) {
        console.error(`[KFZ-188 reminder] ${cfg.typ} fuer ${abr.rechnungsnummer} fehlgeschlagen:`, err)
        fehlgeschlagen++
      }

      // Pro Abrechnung nur den hoechsten passenden Reminder senden (erster Match gewinnt)
      break
    }
  }

  console.log(`[KFZ-188 reminder] gesendet=${gesendet} uebersprungen=${uebersprungen} fehlgeschlagen=${fehlgeschlagen} total=${abrechnungen?.length ?? 0}`)
  return NextResponse.json({
    ok: true,
    gesendet,
    uebersprungen,
    fehlgeschlagen,
    total: abrechnungen?.length ?? 0,
  })
}
