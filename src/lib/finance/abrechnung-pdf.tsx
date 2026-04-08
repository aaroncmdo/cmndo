import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ─────────────────────────────────────────────────────────────────

type Position = {
  fall_id: string | null
  beschreibung: string
  betrag_netto: number
  betrag_brutto: number
}

type AbrechnungData = {
  abrechnungsNr: string
  datum: string
  faelligAm: string
  empfaengerName: string
  empfaengerAdresse?: string
  positionen: Position[]
  summeNetto: number
  ustSatz: number
  ustBetrag: number
  summeBrutto: number
  zeitraumStart: string
  zeitraumEnde: string
}

// ─── Styles ────────────────────────────────────────────────────────────────

const NAVY = '#0D1B3E'
const ONDO = '#4573A2'

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  brand: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: NAVY },
  brandSub: { fontSize: 8, color: '#71717a', marginTop: 2 },
  // Absender + Empfänger
  addressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  addressBlock: { width: '45%' },
  addressLabel: { fontSize: 7, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 1 },
  addressText: { fontSize: 9, color: '#374151', lineHeight: 1.5 },
  // Meta
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  metaBlock: {},
  metaLabel: { fontSize: 7, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: 1 },
  metaValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 2 },
  // Tabelle
  tableHeader: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4 },
  tableHeaderCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#f4f4f5' },
  tableCell: { fontSize: 9, color: '#374151' },
  colNr: { width: '8%' },
  colDesc: { width: '52%' },
  colNetto: { width: '20%', textAlign: 'right' },
  colBrutto: { width: '20%', textAlign: 'right' },
  // Summen
  summenBlock: { marginTop: 12, alignItems: 'flex-end' as const },
  summenRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 3, width: 220 },
  summenLabel: { fontSize: 9, color: '#6b7280', width: 120 },
  summenValue: { fontSize: 9, color: '#374151', textAlign: 'right', width: 100, fontFamily: 'Helvetica-Bold' },
  summenTotal: { flexDirection: 'row', justifyContent: 'flex-end', width: 220, borderTopWidth: 2, borderTopColor: NAVY, paddingTop: 6, marginTop: 6 },
  summenTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, width: 120 },
  summenTotalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, textAlign: 'right', width: 100 },
  // Zahlungshinweis
  zahlungsBlock: { marginTop: 30, padding: 16, backgroundColor: '#f9fafb', borderRadius: 6 },
  zahlungsTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  zahlungsText: { fontSize: 8, color: '#6b7280', lineHeight: 1.5 },
  // Footer
  footer: { position: 'absolute', bottom: 30, left: 50, right: 50, borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 8 },
  footerText: { fontSize: 7, color: '#9ca3af', textAlign: 'center' },
})

function fmtEur(val: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €'
}

// ─── PDF Document ──────────────────────────────────────────────────────────

function AbrechnungPDF({ data }: { data: AbrechnungData }) {
  const iban = process.env.CLAIMONDO_BANK_IBAN || '[IBAN nicht konfiguriert]'
  const bic = process.env.CLAIMONDO_BANK_BIC || '[BIC nicht konfiguriert]'
  const bankName = process.env.CLAIMONDO_BANK_NAME || '[Bank nicht konfiguriert]'
  const ustId = process.env.CLAIMONDO_USTID || '[USt-IdNr nicht konfiguriert]'
  const hrb = process.env.CLAIMONDO_HRB || '[HRB nicht konfiguriert]'
  const gf = process.env.CLAIMONDO_GESCHAEFTSFUEHRER || 'Aaron Sprafke'
  const firmenAdresse = process.env.CLAIMONDO_FIRMENADRESSE || '[Adresse nicht konfiguriert]'

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brand}>Claimondo</Text>
            <Text style={s.brandSub}>Schadenmanagement & Gutachterservice</Text>
          </View>
          <View style={{ alignItems: 'flex-end' as const }}>
            <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: ONDO }}>ABRECHNUNG</Text>
            <Text style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>{data.abrechnungsNr}</Text>
          </View>
        </View>

        {/* Absender + Empfänger */}
        <View style={s.addressRow}>
          <View style={s.addressBlock}>
            <Text style={s.addressLabel}>Absender</Text>
            <Text style={s.addressText}>Claimondo GmbH</Text>
            <Text style={s.addressText}>{firmenAdresse}</Text>
            <Text style={s.addressText}>USt-IdNr: {ustId}</Text>
          </View>
          <View style={s.addressBlock}>
            <Text style={s.addressLabel}>Empfänger</Text>
            <Text style={s.addressText}>{data.empfaengerName}</Text>
            {data.empfaengerAdresse && <Text style={s.addressText}>{data.empfaengerAdresse}</Text>}
          </View>
        </View>

        {/* Meta */}
        <View style={s.metaRow}>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Abrechnungs-Nr</Text>
            <Text style={s.metaValue}>{data.abrechnungsNr}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Zeitraum</Text>
            <Text style={s.metaValue}>{data.zeitraumStart} — {data.zeitraumEnde}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Datum</Text>
            <Text style={s.metaValue}>{data.datum}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Fällig am</Text>
            <Text style={s.metaValue}>{data.faelligAm}</Text>
          </View>
        </View>

        {/* Tabelle */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, s.colNr]}>#</Text>
          <Text style={[s.tableHeaderCell, s.colDesc]}>Beschreibung</Text>
          <Text style={[s.tableHeaderCell, s.colNetto]}>Netto</Text>
          <Text style={[s.tableHeaderCell, s.colBrutto]}>Brutto</Text>
        </View>
        {data.positionen.map((pos, i) => (
          <View key={i} style={s.tableRow}>
            <Text style={[s.tableCell, s.colNr]}>{i + 1}</Text>
            <Text style={[s.tableCell, s.colDesc]}>{pos.beschreibung}</Text>
            <Text style={[s.tableCell, s.colNetto]}>{fmtEur(pos.betrag_netto)}</Text>
            <Text style={[s.tableCell, s.colBrutto]}>{fmtEur(pos.betrag_brutto)}</Text>
          </View>
        ))}

        {/* Summen */}
        <View style={s.summenBlock}>
          <View style={s.summenRow}>
            <Text style={s.summenLabel}>Summe Netto</Text>
            <Text style={s.summenValue}>{fmtEur(data.summeNetto)}</Text>
          </View>
          <View style={s.summenRow}>
            <Text style={s.summenLabel}>USt {data.ustSatz}%</Text>
            <Text style={s.summenValue}>{fmtEur(data.ustBetrag)}</Text>
          </View>
          <View style={s.summenTotal}>
            <Text style={s.summenTotalLabel}>Gesamtbetrag</Text>
            <Text style={s.summenTotalValue}>{fmtEur(data.summeBrutto)}</Text>
          </View>
        </View>

        {/* Zahlungshinweis */}
        <View style={s.zahlungsBlock}>
          <Text style={s.zahlungsTitle}>Zahlungshinweis</Text>
          <Text style={s.zahlungsText}>
            Zahlbar bis {data.faelligAm} auf folgendes Konto:
          </Text>
          <Text style={s.zahlungsText}>
            {bankName} | IBAN: {iban} | BIC: {bic}
          </Text>
          <Text style={s.zahlungsText}>
            Verwendungszweck: {data.abrechnungsNr}
          </Text>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            Claimondo GmbH | {firmenAdresse} | USt-IdNr: {ustId} | {hrb} | GF: {gf}
          </Text>
        </View>
      </Page>
    </Document>
  )
}

// ─── Public API ────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export async function generateAbrechnungPDF(abrechnungId: string): Promise<string | null> {
  const supabase = createAdminClient()

  const { data: abr } = await supabase
    .from('abrechnungen')
    .select('*')
    .eq('id', abrechnungId)
    .single()

  if (!abr) {
    console.error(`[abrechnung-pdf] Abrechnung ${abrechnungId} nicht gefunden`)
    return null
  }

  // Fehlende env vars loggen
  const missingEnvs: string[] = []
  if (!process.env.CLAIMONDO_BANK_IBAN) missingEnvs.push('CLAIMONDO_BANK_IBAN')
  if (!process.env.CLAIMONDO_BANK_BIC) missingEnvs.push('CLAIMONDO_BANK_BIC')
  if (!process.env.CLAIMONDO_BANK_NAME) missingEnvs.push('CLAIMONDO_BANK_NAME')
  if (!process.env.CLAIMONDO_USTID) missingEnvs.push('CLAIMONDO_USTID')
  if (!process.env.CLAIMONDO_FIRMENADRESSE) missingEnvs.push('CLAIMONDO_FIRMENADRESSE')
  if (missingEnvs.length > 0) {
    console.warn(`[abrechnung-pdf] Fehlende env vars: ${missingEnvs.join(', ')} — Platzhalter werden verwendet`)
  }

  const faelligAm = abr.faellig_am
    || new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)

  const data: AbrechnungData = {
    abrechnungsNr: abr.abrechnungs_nr,
    datum: fmtDate(abr.created_at),
    faelligAm: fmtDate(faelligAm),
    empfaengerName: abr.empfaenger_name,
    positionen: abr.positionen as Position[],
    summeNetto: Number(abr.summe_netto),
    ustSatz: Number(abr.ust_satz),
    ustBetrag: Number(abr.ust_betrag),
    summeBrutto: Number(abr.summe_brutto),
    zeitraumStart: fmtDate(abr.abrechnungs_zeitraum_start),
    zeitraumEnde: fmtDate(abr.abrechnungs_zeitraum_ende),
  }

  // PDF rendern
  const pdfBuffer = await renderToBuffer(<AbrechnungPDF data={data} />)

  // Upload nach Storage
  const monat = abr.abrechnungs_zeitraum_start.slice(0, 7) // YYYY-MM
  const [yyyy, mm] = monat.split('-')
  const storagePath = `${yyyy}/${mm}/${abr.abrechnungs_nr}.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('abrechnungen-pdf')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadErr) {
    console.error(`[abrechnung-pdf] Upload fehlgeschlagen:`, uploadErr.message)
    return null
  }

  // pdf_path in DB speichern
  await supabase
    .from('abrechnungen')
    .update({ pdf_path: storagePath })
    .eq('id', abrechnungId)

  console.log(`[abrechnung-pdf] PDF generiert: ${storagePath}`)
  return storagePath
}
