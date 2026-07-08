import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { FINANCE } from '@/lib/finance/constants'
import { eurToCent } from '@/lib/billing/calculate-ust'
import { sendEmail } from '@/lib/email/google/client'
import { render } from '@react-email/render'
import { KanzleiMagicLinkAbrechnungEmail, subject as magicLinkSubject } from '@/lib/email/google/templates/KanzleiMagicLinkAbrechnung'
import { generateAndUploadKanzleiAbrechnungPdf, generateKanzleiAbrechnungPdf } from './generate-pdf'
import type { KanzleiPdfData } from './generate-pdf'
import { istAbrechenbarerKanzleiClaim, type AbrechnungsClaim } from './eligibility'
import { createAbrechnung } from '@/lib/abrechnung/create-abrechnung'
import { KANZLEI_DESCRIPTOR } from '@/lib/abrechnung/descriptors/kanzlei'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'
const BETRAG_PRO_VOLLMACHT_NETTO = FINANCE.KANZLEI_PROVISION_NETTO

/**
 * KFZ-188: Generiert Kanzlei-Monatsabrechnungen fuer alle aktiven Kanzleien.
 *
 * Prueft Claims WHERE (live-signal-basiert, s. eligibility.ts):
 *   - service_typ = 'komplett' + kanzlei_faelle.mandatsnummer gesetzt (echtes Mandat)
 *   - claim_payments.zahlungseingang_am gesetzt (Zahlung eingegangen -> Provision faellig)
 *   - kanzlei_abrechnung_id IS NULL (noch nicht abgerechnet)
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

  // monat/jahr = Abrechnungs-Periode (Label + Idempotenz-Dedup pro Kanzlei/Monat).
  // KEIN vollmacht_signiert_am-Monatsfenster mehr (s. Eligibility-Kommentar unten):
  // abgerechnet werden alle bezahlten, noch nicht abgerechneten Mandate dieser Kanzlei.

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

      // Abrechenbare Claims laden — Eligibility live-signal-basiert (s. eligibility.ts).
      // Kanzlei-Strecke-Investigation 28.06.: die alten Filter waren alle tot →
      // 0 Abrechnungen je. kanzlei_provision_status='berechtigt' (89/89 'offen'),
      // vollmacht_status='unterschrieben' (0/89) und das vollmacht_signiert_am-Monatsfenster
      // (passt nie zum spaeten Zahlungseingang) durch LIVE-Signale ersetzt:
      // mandatsnummer (echtes Mandat) + claim_payments.zahlungseingang_am (Zahlung) +
      // kanzlei_abrechnung_id IS NULL (Idempotenz). claim_nummer = altes faelle.fall_nr.
      // fall_id aus kanzlei_faelle (native, fuer positionen + leads-Lookup).
      const { data: claimsRaw, error: claimsErr } = await db
        .from('claims')
        .select('id, claim_nummer, vollmacht_signiert_am, kanzlei_abrechnung_id, kanzlei_honorar, kanzlei_faelle(fall_id, kanzlei_id, mandatsnummer), claim_payments(partei, zahlungseingang_am, status)')
        .eq('service_typ', 'komplett')
        .is('kanzlei_abrechnung_id', null)

      if (claimsErr) {
        console.error(`[KFZ-188] claims Query fuer ${kanzlei.id}:`, claimsErr.message)
        fehler++
        continue
      }

      const berechtigteClaims = (claimsRaw ?? []).filter((c) =>
        istAbrechenbarerKanzleiClaim(c as unknown as AbrechnungsClaim, kanzlei.id),
      )

      if (!berechtigteClaims?.length) {
        uebersprungen++
        continue
      }

      // Magic-Link Token generieren (vor createAbrechnung, da Token im Header-Row benoetigt)
      const magicToken = crypto.randomBytes(32).toString('hex')
      const heute = new Date()
      const faelligkeitsdatum = new Date(heute.getTime() + 14 * 24 * 60 * 60 * 1000)
      const magicLinkExpires = new Date(faelligkeitsdatum.getTime() + 30 * 24 * 60 * 60 * 1000)

      // Positionen aufbauen — Kundennamen aus leads laden
      const anzahl = berechtigteClaims.length
      type KanzleiPosition = {
        betrag_netto_cent: number
        fall_id: string
        fall_nr: string | null
        kunde_name: string
        vollmacht_unterschrieben_am: string
        position_nr: number
      }
      const positionen: KanzleiPosition[] = []

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
          // CMM-61: kanzlei_honorar aus claims (SSoT) als Cent-Betrag fuer createAbrechnung.
          betrag_netto_cent: eurToCent(
            Number((claim as { kanzlei_honorar?: number | null }).kanzlei_honorar ?? BETRAG_PRO_VOLLMACHT_NETTO),
          ),
          fall_id: fallId,
          // CMM-49: claim_nummer (= altes faelle.fall_nr, 0-diff) aus dem claims-Anker.
          fall_nr: (claim.claim_nummer as string | null) ?? null,
          kunde_name: kundeName,
          // CMM-44 SP-B PR2b: vollmacht_signiert_am aus claims (SSoT, direkt am Anker).
          vollmacht_unterschrieben_am: (claim.vollmacht_signiert_am as string) ?? '',
          position_nr: i + 1,
        })
      }

      // Kanonische Erzeugung: createAbrechnung uebernimmt Netto/MwSt/Brutto-Berechnung,
      // Rechnungsnummer-Vergabe (AAR-948: atomar via rechnungs_nr_counter), Header-Insert,
      // Positionen-Insert und claims-Markierung (kanzlei_abrechnung_id + kanzlei_provision_status).
      const kanzleiClaimIds = berechtigteClaims.map((c) => c.id).filter((id): id is string => !!id)
      const abrResult = await createAbrechnung(db, KANZLEI_DESCRIPTOR, {
        positionen,
        kontext: {
          kanzlei_id: kanzlei.id,
          monat,
          jahr,
          monatPad,
          anzahl_vollmachten: anzahl,
          magic_link_token: magicToken,
          magic_link_expires_at: magicLinkExpires.toISOString(),
          faelligkeitsdatum: faelligkeitsdatum.toISOString().slice(0, 10),
          claim_ids: kanzleiClaimIds,
        },
      })

      if (!abrResult.ok) {
        console.error(`[KFZ-188] createAbrechnung fehlgeschlagen fuer ${kanzlei.id}:`, abrResult.error)
        fehler++
        continue
      }

      if (!abrResult.erstellt) {
        // Schon eine Abrechnung fuer diesen Monat (pruefeBestehend) — uebersprungen.
        // (Normalfall: bereits durch den Idempotenz-Check oben abgefangen; dieser Zweig
        //  ist ein zusaetzlicher Safety-Net falls pruefeBestehend eine race-condition faengt.)
        uebersprungen++
        continue
      }

      const abrechnungId = abrResult.id
      const rechnungsnummer = abrResult.nummer
      const nettoGesamt = abrResult.betraege.nettoCent / 100
      const mwstBetrag = abrResult.betraege.ustCent / 100
      const brutto = abrResult.betraege.bruttoCent / 100

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
          betragNetto: p.betrag_netto_cent / 100,
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
