// Token-Audit-Skip: @react-pdf/renderer hat kein CSS-Var-Support — inline-hex Pflicht.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
//
// Makler-Provisions-RECHNUNG: der Makler stellt Claimondo eine Rechnung ueber seine
// freigegebenen (abrechenbaren) Provisionen. Gespiegelt von der Kanzlei-Abrechnung
// (src/lib/abrechnung/kanzlei/generate-pdf.tsx), aber Richtung umgedreht: der MAKLER
// ist Aussteller/Absender, Claimondo der Empfaenger. Felder die der Makler nicht
// hinterlegt hat (USt-IdNr, IBAN) erscheinen als sichtbarer Platzhalter zum Ausfuellen.
import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { getAktuelleRechnungsKonfig, type RechnungsKonfig } from '@/lib/billing/get-rechnungs-konfig'

const NAVY = '#0D1B3E'
const ONDO = '#4573A2'
const PLACEHOLDER = '#c026d3' // sichtbar-magenta: signalisiert "bitte ausfuellen"

export type MaklerRechnungData = {
  rechnungsnummer: string
  datum: string
  leistungszeitraum: string
  makler: {
    firma: string
    adresse: string // mehrzeilig, "\n"-getrennt
    ustId: string | null
    iban: string | null
    bic: string | null
    kontoinhaber: string | null
  }
  positionen: Array<{
    nr: number
    datum: string
    fallNr: string
    kundeName: string
    betragNetto: number
  }>
  nettoGesamt: number
  mwstBetrag: number
  brutto: number
}

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  brand: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: NAVY },
  brandSub: { fontSize: 8, color: '#71717a', marginTop: 2 },
  addressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  addressBlock: { width: '45%' },
  addressLabel: { fontSize: 7, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 1 },
  addressText: { fontSize: 9, color: '#374151', lineHeight: 1.5 },
  placeholder: { fontSize: 9, color: PLACEHOLDER, lineHeight: 1.5, fontFamily: 'Helvetica-Bold' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  metaLabel: { fontSize: 7, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: 1 },
  metaValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 2 },
  tableHeader: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4 },
  tableHeaderCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#f4f4f5' },
  tableCell: { fontSize: 9, color: '#374151' },
  colPos: { width: '7%' },
  colDatum: { width: '18%' },
  colFallNr: { width: '20%' },
  colKunde: { width: '35%' },
  colBetrag: { width: '20%', textAlign: 'right' as const },
  summenBlock: { marginTop: 12, alignItems: 'flex-end' as const },
  summenRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 3, width: 220 },
  summenLabel: { fontSize: 9, color: '#6b7280', width: 120 },
  summenValue: { fontSize: 9, color: '#374151', textAlign: 'right' as const, width: 100, fontFamily: 'Helvetica-Bold' },
  summenTotal: { flexDirection: 'row', justifyContent: 'flex-end', width: 220, borderTopWidth: 2, borderTopColor: NAVY, paddingTop: 6, marginTop: 6 },
  summenTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, width: 120 },
  summenTotalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, textAlign: 'right' as const, width: 100 },
  zahlungsBlock: { marginTop: 30, padding: 16, backgroundColor: '#f9fafb', borderRadius: 6 },
  zahlungsTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  zahlungsText: { fontSize: 8, color: '#6b7280', lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 30, left: 50, right: 50, borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 8 },
  footerText: { fontSize: 7, color: '#9ca3af', textAlign: 'center' as const },
})

function fmtEur(val: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €'
}

function MaklerRechnungPDF({ data, konfig }: { data: MaklerRechnungData; konfig: RechnungsKonfig }) {
  // Rechnungsempfaenger = die Plattform-Entitaet aus der rechnungs_konfiguration (SSoT).
  // Der Makler ist Aussteller, die UG (bzw. jeweils aktive Konfig) der Empfaenger seiner Provisions-Rechnung.
  const empfaengerName = konfig.firmenname
  const empfaengerAdresse = `${konfig.strasse}, ${konfig.plz} ${konfig.ort}`
  const m = data.makler
  const adressZeilen = (m.adresse || '').split('\n').filter(Boolean)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header: der Makler ist Aussteller */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brand}>{m.firma || 'Ihre Firma'}</Text>
            <Text style={s.brandSub}>Provisions-Abrechnung</Text>
          </View>
          <View style={{ alignItems: 'flex-end' as const }}>
            <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: ONDO }}>RECHNUNG</Text>
            <Text style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>{data.rechnungsnummer}</Text>
          </View>
        </View>

        {/* Absender (Makler) + Empfaenger (Claimondo) */}
        <View style={s.addressRow}>
          <View style={s.addressBlock}>
            <Text style={s.addressLabel}>Rechnungssteller</Text>
            <Text style={s.addressText}>{m.firma || ''}</Text>
            {adressZeilen.length > 0
              ? adressZeilen.map((z, i) => <Text key={i} style={s.addressText}>{z}</Text>)
              : <Text style={s.placeholder}>[Ihre Anschrift]</Text>}
            {m.ustId
              ? <Text style={s.addressText}>USt-IdNr: {m.ustId}</Text>
              : <Text style={s.placeholder}>USt-IdNr: [bitte in den Einstellungen ergaenzen]</Text>}
          </View>
          <View style={s.addressBlock}>
            <Text style={s.addressLabel}>Rechnungsempfaenger</Text>
            <Text style={s.addressText}>{empfaengerName}</Text>
            <Text style={s.addressText}>{empfaengerAdresse}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={s.metaRow}>
          <View>
            <Text style={s.metaLabel}>Rechnungsnummer</Text>
            <Text style={s.metaValue}>{data.rechnungsnummer}</Text>
          </View>
          <View>
            <Text style={s.metaLabel}>Leistungszeitraum</Text>
            <Text style={s.metaValue}>{data.leistungszeitraum}</Text>
          </View>
          <View>
            <Text style={s.metaLabel}>Datum</Text>
            <Text style={s.metaValue}>{data.datum}</Text>
          </View>
        </View>

        {/* Positionen: freigegebene Provisionen */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, s.colPos]}>Pos</Text>
          <Text style={[s.tableHeaderCell, s.colDatum]}>Datum</Text>
          <Text style={[s.tableHeaderCell, s.colFallNr]}>Fall-Nr</Text>
          <Text style={[s.tableHeaderCell, s.colKunde]}>Vermittlung</Text>
          <Text style={[s.tableHeaderCell, s.colBetrag]}>Betrag (netto)</Text>
        </View>
        {data.positionen.map((pos, i) => (
          <View key={i} style={s.tableRow}>
            <Text style={[s.tableCell, s.colPos]}>{pos.nr}</Text>
            <Text style={[s.tableCell, s.colDatum]}>{pos.datum}</Text>
            <Text style={[s.tableCell, s.colFallNr]}>{pos.fallNr || '—'}</Text>
            <Text style={[s.tableCell, s.colKunde]}>{pos.kundeName || 'Vermittlung'}</Text>
            <Text style={[s.tableCell, s.colBetrag]}>{fmtEur(pos.betragNetto)}</Text>
          </View>
        ))}

        {/* Summen */}
        <View style={s.summenBlock}>
          <View style={s.summenRow}>
            <Text style={s.summenLabel}>Summe Netto</Text>
            <Text style={s.summenValue}>{fmtEur(data.nettoGesamt)}</Text>
          </View>
          <View style={s.summenRow}>
            <Text style={s.summenLabel}>zzgl. USt. 19 %</Text>
            <Text style={s.summenValue}>{fmtEur(data.mwstBetrag)}</Text>
          </View>
          <View style={s.summenTotal}>
            <Text style={s.summenTotalLabel}>Gesamtbetrag</Text>
            <Text style={s.summenTotalValue}>{fmtEur(data.brutto)}</Text>
          </View>
        </View>

        {/* Zahlungshinweis: Bankverbindung des Maklers */}
        <View style={s.zahlungsBlock}>
          <Text style={s.zahlungsTitle}>Bitte ueberweisen Sie den Gesamtbetrag auf folgendes Konto:</Text>
          {m.iban ? (
            <>
              <Text style={s.zahlungsText}>Kontoinhaber: {m.kontoinhaber || m.firma}</Text>
              <Text style={s.zahlungsText}>IBAN: {m.iban}</Text>
              {m.bic ? <Text style={s.zahlungsText}>BIC: {m.bic}</Text> : null}
            </>
          ) : (
            <Text style={s.placeholder}>[Ihre Bankverbindung — bitte in den Einstellungen ergaenzen]</Text>
          )}
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>
            {m.firma || 'Ihre Firma'}{m.ustId ? ` | USt-IdNr: ${m.ustId}` : ''} — Provisions-Abrechnung ueber die Claimondo-Plattform
          </Text>
        </View>
      </Page>
    </Document>
  )
}

export async function generateMaklerRechnungPdf(data: MaklerRechnungData): Promise<Buffer> {
  const konfig = await getAktuelleRechnungsKonfig()
  const pdfBuffer = await renderToBuffer(<MaklerRechnungPDF data={data} konfig={konfig} />)
  return Buffer.from(pdfBuffer)
}
