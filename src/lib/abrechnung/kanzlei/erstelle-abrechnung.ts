import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { nextRechnungsNrRaw } from '@/lib/billing/generate-rechnungs-nr'
import { FINANCE } from '@/lib/finance/constants'
import { sendEmail } from '@/lib/email/google/client'
import { render } from '@react-email/render'
import { KanzleiMagicLinkAbrechnungEmail, subject as magicLinkSubject } from '@/lib/email/google/templates/KanzleiMagicLinkAbrechnung'
import { generateAndUploadKanzleiAbrechnungPdf, generateKanzleiAbrechnungPdf } from './generate-pdf'
import type { KanzleiPdfData } from './generate-pdf'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'
const BETRAG_PRO_VOLLMACHT_NETTO = 150

/**
 * KFZ-188: Generiert Kanzlei-Monatsabrechnungen fuer alle aktiven Kanzleien.
 *
 * Prueft Claims WHERE:
 *   - vollmacht_status = 'unterschrieben'
 *   - kanzlei_provision_status = 'berechtigt'
 *   - kanzlei_abrechnung_id IS NULL
 *   - vollmacht_signiert_am liegt im Zielmonat
 *
 * Pro Kanzlei mit >= 1 Fall:
 *   - Berechnet Netto/MwSt/Brutto
 *   - Erstellt kanzlei_abrechnungen Eintrag
 *   - Erstellt kanzlei_abrechnung_positionen Eintraege
 *   - Updated claims.kanzlei_abrechnung_id + claims.kanzlei_provision_status='abgerechnet' (CMM-61: SSoT)
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

  // AAR-948: Serie CMNDO-K-{YYYY}-{MM}-{NNN} jetzt atomar + lückenlos via
  // rechnungs_nr_counter (next_rechnungs_nr, UPSERT+RETURNING) statt
  // race-anfälligem inline-LIKE-MAX. Der Monat steckt im serie-Key
  // (`CMNDO-K-{MM}`), damit der Zähler pro Monat zurücksetzt. Vergabe je
  // Kanzlei direkt vor dem Insert (s.u.).
  const monatPad = String(monat).padStart(2, '0')

  // Alle aktiven Kanzleien laden
  const { data: kanzleien, error: kanzleiErr } = await db
    .from('kanzleien')
    .select('id, name, email, ansprechpartner, adresse')
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

      // Berechtigte Claims laden.
      // CMM-49 Reader-Sweep: Anker auf claims (faelle-frei, ueberlebt den faelle-DROP).
      // vollmacht_signiert_am/vollmacht_status (CMM-44 SP-B), kanzlei_abrechnung_id (SP-J),
      // kanzlei_honorar + kanzlei_provision_status (CMM-61) leben alle auf claims (SSoT) →
      // direkt selektieren statt ueber den frueheren faelle->claims-!inner-Embed.
      // kanzlei_faelle(fall_id, kanzlei_id): kanzlei_id fuer die Kanzlei-Zuordnung,
      // fall_id (native Spalte, 0-null verifiziert) fuer die fall_id-gekeyten
      // kanzlei_abrechnung_positionen + leads (KEIN claim_id->fall_id-Reverse).
      // claim_nummer = altes faelle.fall_nr (0-diff). claim.id = altes claim_id.
      // SP-B/SP-J-Filter (vollmacht_status/-fenster, abrechnung_id IS NULL) in App-Code.
      const { data: claimsRaw, error: claimsErr } = await db
        .from('claims')
        .select('id, claim_nummer, kanzlei_faelle(fall_id, kanzlei_id), vollmacht_signiert_am, vollmacht_status, kanzlei_abrechnung_id, kanzlei_honorar')
        .eq('kanzlei_provision_status', 'berechtigt')
      const berechtigteClaims = (claimsRaw ?? []).filter((c) => {
        // CMM-44 SP-I6: Kanzlei-Zuordnung aus dem kanzlei_faelle-Embed (Array-normalisiert).
        const kf = Array.isArray((c as { kanzlei_faelle?: unknown }).kanzlei_faelle)
          ? (c as { kanzlei_faelle: unknown[] }).kanzlei_faelle[0]
          : (c as { kanzlei_faelle?: unknown }).kanzlei_faelle
        if (((kf as { kanzlei_id?: string | null } | null)?.kanzlei_id) !== kanzlei.id) return false
        // SP-J-Filter: kanzlei_abrechnung_id IS NULL (noch nicht abgerechnet).
        if ((c as { kanzlei_abrechnung_id?: string | null }).kanzlei_abrechnung_id != null) return false
        // SP-B-Filter: vollmacht_status + vollmacht_signiert_am-Fenster.
        if ((c.vollmacht_status as string | null) !== 'unterschrieben') return false
        const vam = (c.vollmacht_signiert_am as string | null) ?? null
        if (!vam) return false
        return vam >= startStr && vam <= endeStr + 'T23:59:59'
      })

      if (claimsErr) {
        console.error(`[KFZ-188] claims Query fuer ${kanzlei.id}:`, claimsErr.message)
        fehler++
        continue
      }

      if (!berechtigteClaims?.length) {
        uebersprungen++
        continue
      }

      // Betraege berechnen
      const anzahl = berechtigteClaims.length
      const nettoGesamt = anzahl * BETRAG_PRO_VOLLMACHT_NETTO
      const mwstBetrag = Math.round(nettoGesamt * FINANCE.MWST_PROZENT / 100 * 100) / 100
      const brutto = Math.round((nettoGesamt + mwstBetrag) * 100) / 100

      // Magic-Link Token generieren
      const magicToken = crypto.randomBytes(32).toString('hex')
      const heute = new Date()
      const faelligkeitsdatum = new Date(heute.getTime() + 14 * 24 * 60 * 60 * 1000)
      const magicLinkExpires = new Date(faelligkeitsdatum.getTime() + 30 * 24 * 60 * 60 * 1000)

      // Rechnungsnummer atomar vergeben (AAR-948): zählt im rechnungs_nr_counter
      // hoch (lückenlos, keine Race-Condition zwischen parallelen Cron-Läufen).
      const lfdNr = await nextRechnungsNrRaw(`CMNDO-K-${monatPad}`, jahr)
      const rechnungsnummer = `CMNDO-K-${jahr}-${monatPad}-${String(lfdNr).padStart(3, '0')}`

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

      for (let i = 0; i < berechtigteClaims.length; i++) {
        const claim = berechtigteClaims[i]

        // CMM-49: fall_id aus dem kanzlei_faelle-Embed (native Spalte, 0-null verifiziert).
        // kanzlei_abrechnung_positionen.fall_id + leads sind fall_id-gekeyt; kf.fall_id ist die
        // echte kanzlei_faelle-Spalte (KEIN claim_id->fall_id-Reverse via Bridge).
        const claimKf = Array.isArray((claim as { kanzlei_faelle?: unknown }).kanzlei_faelle)
          ? (claim as { kanzlei_faelle: unknown[] }).kanzlei_faelle[0]
          : (claim as { kanzlei_faelle?: unknown }).kanzlei_faelle
        const fallId = (claimKf as { fall_id?: string | null } | null)?.fall_id as string

        // Kundenname aus leads Tabelle
        let kundeName = 'Unbekannt'
        const { data: lead } = await db
          .from('leads')
          .select('vorname, nachname')
          .eq('fall_id', fallId)
          .limit(1)
          .maybeSingle()
        if (lead) {
          kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Unbekannt'
        }

        positionen.push({
          kanzlei_abrechnung_id: abrechnungId,
          fall_id: fallId,
          // CMM-49: claim_nummer (= altes faelle.fall_nr, 0-diff) aus dem claims-Anker.
          fall_nr: (claim.claim_nummer as string | null) ?? null,
          kunde_name: kundeName,
          // CMM-44 SP-B PR2b: vollmacht_signiert_am aus claims (SSoT, direkt am Anker).
          vollmacht_unterschrieben_am: (claim.vollmacht_signiert_am as string) ?? '',
          // CMM-61: kanzlei_honorar aus claims (SSoT), nicht mehr faelle.
          betrag_netto: Number((claim as { kanzlei_honorar?: number | null }).kanzlei_honorar ?? BETRAG_PRO_VOLLMACHT_NETTO),
          position_nr: i + 1,
        })
      }

      if (positionen.length > 0) {
        const { error: posErr } = await db.from('kanzlei_abrechnung_positionen').insert(positionen)
        if (posErr) {
          console.error(`[KFZ-188] positionen insert fuer ${abrechnungId}:`, posErr.message)
        }
      }

      // claims aktualisieren (SSoT).
      // CMM-44 SP-J Bucket B: kanzlei_abrechnung_id auf claims.
      // CMM-61: kanzlei_provision_status auf claims (war faelle-nativ) — beide Writes
      // in EINEM claims.update gebuendelt ueber die claim_ids (= berechtigteClaims.id).
      const kanzleiClaimIds = berechtigteClaims.map((c) => c.id).filter((id): id is string => !!id)
      if (kanzleiClaimIds.length > 0) {
        await db
          .from('claims')
          .update({ kanzlei_provision_status: 'abgerechnet', kanzlei_abrechnung_id: abrechnungId })
          .in('id', kanzleiClaimIds)
      }

      // Email mit Magic-Link versenden
      const magicUrl = `${APP_URL}/kanzlei/abrechnung/${magicToken}`
      const ansprechpartner = kanzlei.ansprechpartner ?? 'Sehr geehrte Damen und Herren'
      const monatName = new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(new Date(jahr, monat - 1, 1))
      const monatLabel = `${monatName} ${jahr}`

      function fmtEurStr(val: number): string {
        return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €'
      }
      function fmtDateStr(d: Date): string {
        return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
      }

      // PDF generieren
      const pdfData: KanzleiPdfData = {
        rechnungsnummer,
        datum: fmtDateStr(new Date()),
        faelligAm: fmtDateStr(faelligkeitsdatum),
        leistungszeitraum: monatLabel,
        kanzleiName: kanzlei.name,
        kanzleiAdresse: (kanzlei as { adresse?: string }).adresse ?? '',
        positionen: positionen.map(p => ({
          nr: p.position_nr,
          vollmachtDatum: fmtDateStr(new Date(p.vollmacht_unterschrieben_am)),
          fallNr: p.fall_nr ?? '',
          kundeName: p.kunde_name,
          betragNetto: p.betrag_netto,
        })),
        nettoGesamt,
        mwstBetrag,
        brutto,
        magicLinkUrl: magicUrl,
      }

      let pdfBuffer: Buffer | null = null
      let pdfStoragePath: string | null = null
      try {
        pdfStoragePath = await generateAndUploadKanzleiAbrechnungPdf(pdfData, monat, jahr)
        pdfBuffer = await generateKanzleiAbrechnungPdf(pdfData)
        // pdf_path in DB speichern
        if (pdfStoragePath) {
          await db
            .from('kanzlei_abrechnungen')
            .update({ pdf_path: pdfStoragePath })
            .eq('id', abrechnungId)
        }
      } catch (pdfErr) {
        console.error(`[KFZ-188] PDF-Generierung fuer ${kanzlei.id}:`, pdfErr)
        // PDF-Fehler ist nicht fatal — Email ohne Anhang senden
      }

      const emailProps = {
        ansprechpartner,
        rechnungsnummer,
        monat: monatLabel,
        anzahl,
        nettoGesamt: fmtEurStr(nettoGesamt),
        mwstBetrag: fmtEurStr(mwstBetrag),
        brutto: fmtEurStr(brutto),
        faelligAm: fmtDateStr(faelligkeitsdatum),
        magicLinkUrl: magicUrl,
        magicLinkExpiresAm: fmtDateStr(magicLinkExpires),
      }

      try {
        const html = await render(KanzleiMagicLinkAbrechnungEmail(emailProps))
        // TODO: migrate to sendCommunication when attachment support added
        await sendEmail({
          to: kanzlei.email,
          subject: magicLinkSubject(emailProps),
          html,
          attachments: pdfBuffer
            ? [{ filename: `${rechnungsnummer}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
            : undefined,
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
