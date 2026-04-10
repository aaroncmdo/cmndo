import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/google/client'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'
const BETRAG_PRO_VOLLMACHT_NETTO = 150

/**
 * KFZ-188: Generiert Kanzlei-Monatsabrechnungen fuer alle aktiven Kanzleien.
 *
 * Prueft faelle WHERE:
 *   - vollmacht_status = 'unterschrieben'
 *   - kanzlei_provision_status = 'berechtigt'
 *   - kanzlei_abrechnung_id IS NULL
 *   - vollmacht_signiert_am liegt im Zielmonat
 *
 * Pro Kanzlei mit >= 1 Fall:
 *   - Berechnet Netto/MwSt/Brutto
 *   - Erstellt kanzlei_abrechnungen Eintrag
 *   - Erstellt kanzlei_abrechnung_positionen Eintraege
 *   - Updated faelle.kanzlei_abrechnung_id + kanzlei_provision_status='abgerechnet'
 *   - Versendet Rechnung per Email mit Magic-Link
 */
export async function erstelleKanzleiAbrechnung(
  monat: number,
  jahr: number,
): Promise<{
  erstellt: number
  uebersprungen: number
  fehler: number
  details: Array<{ kanzlei_id: string; kanzlei_name: string; anzahl: number; rechnungsnummer: string }>
}> {
  const db = createAdminClient()

  // Monatsgrenzen berechnen
  const startDatum = new Date(Date.UTC(jahr, monat - 1, 1))
  const endeDatum = new Date(Date.UTC(jahr, monat, 0, 23, 59, 59))
  const startStr = startDatum.toISOString().slice(0, 10)
  const endeStr = endeDatum.toISOString().slice(0, 10)

  // Sequentielle Nummer berechnen: CMNDO-K-{YYYY}-{MM}-{NNN}
  const monatPad = String(monat).padStart(2, '0')
  const prefix = `CMNDO-K-${jahr}-${monatPad}`
  const { data: lastAbr } = await db
    .from('kanzlei_abrechnungen')
    .select('rechnungsnummer')
    .like('rechnungsnummer', `${prefix}-%`)
    .order('rechnungsnummer', { ascending: false })
    .limit(1)
  let lfdNr = 1
  if (lastAbr?.[0]?.rechnungsnummer) {
    const parts = (lastAbr[0].rechnungsnummer as string).split('-')
    const lastNr = parseInt(parts[parts.length - 1])
    if (!isNaN(lastNr)) lfdNr = lastNr + 1
  }

  // Alle aktiven Kanzleien laden
  const { data: kanzleien, error: kanzleiErr } = await db
    .from('kanzleien')
    .select('id, name, email, ansprechpartner')
    .eq('aktiv', true)

  if (kanzleiErr) throw new Error(`kanzleien Query: ${kanzleiErr.message}`)
  if (!kanzleien?.length) return { erstellt: 0, uebersprungen: 0, fehler: 0, details: [] }

  let erstellt = 0
  let uebersprungen = 0
  let fehler = 0
  const details: Array<{ kanzlei_id: string; kanzlei_name: string; anzahl: number; rechnungsnummer: string }> = []

  for (const kanzlei of kanzleien) {
    try {
      // Idempotenz: schon eine Abrechnung fuer diesen Monat?
      const { data: vorhandene } = await db
        .from('kanzlei_abrechnungen')
        .select('id')
        .eq('kanzlei_id', kanzlei.id)
        .eq('abrechnungsmonat', monat)
        .eq('abrechnungsjahr', jahr)
        .limit(1)
        .maybeSingle()

      if (vorhandene) {
        uebersprungen++
        continue
      }

      // Berechtigte Faelle laden
      const { data: faelle, error: faelleErr } = await db
        .from('faelle')
        .select('id, fall_nr, vollmacht_signiert_am, kanzlei_honorar')
        .eq('kanzlei_id', kanzlei.id)
        .eq('vollmacht_status', 'unterschrieben')
        .eq('kanzlei_provision_status', 'berechtigt')
        .is('kanzlei_abrechnung_id', null)
        .gte('vollmacht_signiert_am', startStr)
        .lte('vollmacht_signiert_am', endeStr + 'T23:59:59')

      if (faelleErr) {
        console.error(`[KFZ-188] faelle Query fuer ${kanzlei.id}:`, faelleErr.message)
        fehler++
        continue
      }

      if (!faelle?.length) {
        uebersprungen++
        continue
      }

      // Betraege berechnen
      const anzahl = faelle.length
      const nettoGesamt = anzahl * BETRAG_PRO_VOLLMACHT_NETTO
      const mwstBetrag = Math.round(nettoGesamt * 0.19 * 100) / 100
      const brutto = Math.round((nettoGesamt + mwstBetrag) * 100) / 100

      // Magic-Link Token generieren
      const magicToken = crypto.randomBytes(32).toString('hex')
      const heute = new Date()
      const faelligkeitsdatum = new Date(heute.getTime() + 14 * 24 * 60 * 60 * 1000)
      const magicLinkExpires = new Date(faelligkeitsdatum.getTime() + 30 * 24 * 60 * 60 * 1000)

      // Rechnungsnummer vergeben
      const rechnungsnummer = `${prefix}-${String(lfdNr).padStart(3, '0')}`
      lfdNr++

      // kanzlei_abrechnungen einfuegen
      const { data: abrechnung, error: insertErr } = await db
        .from('kanzlei_abrechnungen')
        .insert({
          kanzlei_id: kanzlei.id,
          abrechnungsmonat: monat,
          abrechnungsjahr: jahr,
          rechnungsnummer,
          anzahl_vollmachten: anzahl,
          betrag_pro_vollmacht_netto: BETRAG_PRO_VOLLMACHT_NETTO,
          endbetrag_netto: nettoGesamt,
          mwst_betrag: mwstBetrag,
          endbetrag_brutto: brutto,
          magic_link_token: magicToken,
          magic_link_expires_at: magicLinkExpires.toISOString(),
          status: 'offen',
          faelligkeitsdatum: faelligkeitsdatum.toISOString().slice(0, 10),
        })
        .select('id')
        .single()

      if (insertErr || !abrechnung) {
        console.error(`[KFZ-188] kanzlei_abrechnungen insert fuer ${kanzlei.id}:`, insertErr?.message)
        fehler++
        continue
      }

      const abrechnungId = abrechnung.id as string

      // Positionen einfuegen — Kundennamen aus leads laden
      const positionen: Array<{
        kanzlei_abrechnung_id: string
        fall_id: string
        fall_nr: string | null
        kunde_name: string
        vollmacht_unterschrieben_am: string
        betrag_netto: number
        position_nr: number
      }> = []

      for (let i = 0; i < faelle.length; i++) {
        const fall = faelle[i]

        // Kundenname aus leads Tabelle
        let kundeName = 'Unbekannt'
        const { data: lead } = await db
          .from('leads')
          .select('vorname, nachname')
          .eq('fall_id', fall.id)
          .limit(1)
          .maybeSingle()
        if (lead) {
          kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Unbekannt'
        }

        positionen.push({
          kanzlei_abrechnung_id: abrechnungId,
          fall_id: fall.id,
          fall_nr: fall.fall_nr ?? null,
          kunde_name: kundeName,
          vollmacht_unterschrieben_am: fall.vollmacht_signiert_am as string,
          betrag_netto: Number(fall.kanzlei_honorar ?? BETRAG_PRO_VOLLMACHT_NETTO),
          position_nr: i + 1,
        })
      }

      if (positionen.length > 0) {
        const { error: posErr } = await db.from('kanzlei_abrechnung_positionen').insert(positionen)
        if (posErr) {
          console.error(`[KFZ-188] positionen insert fuer ${abrechnungId}:`, posErr.message)
        }
      }

      // faelle aktualisieren
      const fallIds = faelle.map(f => f.id)
      await db
        .from('faelle')
        .update({
          kanzlei_abrechnung_id: abrechnungId,
          kanzlei_provision_status: 'abgerechnet',
        })
        .in('id', fallIds)

      // Email mit Magic-Link versenden
      const magicUrl = `${APP_URL}/kanzlei/abrechnung/${magicToken}`
      const ansprechpartner = kanzlei.ansprechpartner ?? 'Sehr geehrte Damen und Herren'
      const monatName = new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(new Date(jahr, monat - 1, 1))

      try {
        await sendEmail({
          to: kanzlei.email,
          subject: `Monatsabrechnung ${monatName} ${jahr} — ${rechnungsnummer}`,
          html: `
<p>Hallo ${ansprechpartner},</p>
<p>anbei Ihre Abrechnung fuer <strong>${monatName} ${jahr}</strong>:</p>
<ul>
  <li>Rechnungsnummer: <strong>${rechnungsnummer}</strong></li>
  <li>Anzahl Vollmachten: <strong>${anzahl}</strong></li>
  <li>Nettobetrag: <strong>${nettoGesamt.toFixed(2).replace('.', ',')} €</strong></li>
  <li>MwSt. (19 %): <strong>${mwstBetrag.toFixed(2).replace('.', ',')} €</strong></li>
  <li>Bruttobetrag: <strong>${brutto.toFixed(2).replace('.', ',')} €</strong></li>
  <li>Faellig am: <strong>${faelligkeitsdatum.toISOString().slice(0, 10)}</strong></li>
</ul>
<p>
  <a href="${magicUrl}" style="display:inline-block;padding:12px 24px;background:#0D1B3E;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
    Rechnung aufrufen &amp; bezahlen
  </a>
</p>
<p>Dieser Link ist bis zum ${magicLinkExpires.toISOString().slice(0, 10)} gueltig.</p>
<p>Mit freundlichen Gruessen,<br>Ihr Claimondo-Team</p>
`,
          empfaengerTyp: 'kanzlei',
          template: 'kanzlei_monatsabrechnung',
        })
      } catch (mailErr) {
        console.error(`[KFZ-188] Email fuer ${kanzlei.id}:`, mailErr)
        // Email-Fehler ist nicht fatal — Abrechnung wurde erstellt
      }

      // Status auf versendet setzen
      await db
        .from('kanzlei_abrechnungen')
        .update({ status: 'versendet', versendet_am: new Date().toISOString() })
        .eq('id', abrechnungId)

      erstellt++
      details.push({
        kanzlei_id: kanzlei.id,
        kanzlei_name: kanzlei.name,
        anzahl,
        rechnungsnummer,
      })
    } catch (err) {
      console.error(`[KFZ-188] Unerwarteter Fehler fuer Kanzlei ${kanzlei.id}:`, err)
      fehler++
    }
  }

  console.log(`[KFZ-188] erstelleKanzleiAbrechnung ${monat}/${jahr}: erstellt=${erstellt} uebersprungen=${uebersprungen} fehler=${fehler}`)
  return { erstellt, uebersprungen, fehler, details }
}
