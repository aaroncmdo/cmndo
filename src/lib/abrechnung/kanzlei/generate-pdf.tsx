import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ──────────────────────────────────────────────────────────────────

export type KanzleiPdfData = {
  rechnungsnummer: string
  datum: string
  faelligAm: string
  leistungszeitraum: string  // "März 2026"
  kanzleiName: string
  kanzleiAdresse: string
  positionen: Array<{
    nr: number
    vollmachtDatum: string
    fallNr: string
    kundeName: string
    betragNetto: number
  }>
  nettoGesamt: number
  mwstBetrag: number
  brutto: number
  magicLinkUrl: string
}

// ─── Styles (gleiche Farbpalette wie abrechnung-pdf.tsx) ─────────────────────

const NAVY = '#0D1B3E'
const ONDO = '#4573A2'

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  brand: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: NAVY },
  brandSub: { fontSize: 8, color: '#71717a', marginTop: 2 },
  // Absender + Empfaenger
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
  colPos: { width: '6%' },
  colDatum: { width: '18%' },
  colFallNr: { width: '18%' },
  colKunde: { width: '38%' },
  colBetrag: { width: '20%', textAlign: 'right' as const },
  // Summen
  summenBlock: { marginTop: 12, alignItems: 'flex-end' as const },
  summenRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 3, width: 220 },
  summenLabel: { fontSize: 9, color: '#6b7280', width: 120 },
  summenValue: { fontSize: 9, color: '#374151', textAlign: 'right' as const, width: 100, fontFamily: 'Helvetica-Bold' },
  summenTotal: { flexDirection: 'row', justifyContent: 'flex-end', width: 220, borderTopWidth: 2, borderTopColor: NAVY, paddingTop: 6, marginTop: 6 },
  summenTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, width: 120 },
  summenTotalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, textAlign: 'right' as const, width: 100 },
  // Zahlungshinweis
  zahlungsBlock: { marginTop: 30, padding: 16, backgroundColor: '#f9fafb', borderRadius: 6 },
  zahlungsTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  zahlungsText: { fontSize: 8, color: '#6b7280', lineHeight: 1.5 },
  zahlungsLink: { fontSize: 8, color: ONDO, lineHeight: 1.5 },
  // Footer
  footer: { position: 'absolute', bottom: 30, left: 50, right: 50, borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 8 },
  footerText: { fontSize: 7, color: '#9ca3af', textAlign: 'center' as const },
})

function fmtEur(val: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' \u20AC'
}

// ─── PDF Document ────────────────────────────────────────────────────────────

function KanzleiAbrechnungPDF({ data }: { data: KanzleiPdfData }) {
  const firmenAdresse = process.env.CLAIMONDO_FIRMENADRESSE || 'Musterstr. 1, 50667 Koeln'
  const ustId = process.env.CLAIMONDO_USTID || '[USt-IdNr nicht konfiguriert]'
  const gf = process.env.CLAIMONDO_GESCHAEFTSFUEHRER || 'Aaron Sprafke'

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brand}>Claimondo</Text>
            <Text style={s.brandSub}>Claimondo GmbH, {firmenAdresse}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' as const }}>
            <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: ONDO }}>RECHNUNG</Text>
            <Text style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>{data.rechnungsnummer}</Text>
          </View>
        </View>

        {/* Absender + Empfaenger */}
        <View style={s.addressRow}>
          <View style={s.addressBlock}>
            <Text style={s.addressLabel}>Absender</Text>
            <Text style={s.addressText}>Claimondo GmbH</Text>
            <Text style={s.addressText}>{firmenAdresse}</Text>
            <Text style={s.addressText}>USt-IdNr: {ustId}</Text>
          </View>
          <View style={s.addressBlock}>
            <Text style={s.addressLabel}>Empfaenger</Text>
            <Text style={s.addressText}>{data.kanzleiName}</Text>
            {data.kanzleiAdresse ? (
              <Text style={s.addressText}>{data.kanzleiAdresse}</Text>
            ) : null}
          </View>
        </View>

        {/* Meta */}
        <View style={s.metaRow}>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Rechnungsnummer</Text>
            <Text style={s.metaValue}>{data.rechnungsnummer}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Leistungszeitraum</Text>
            <Text style={s.metaValue}>{data.leistungszeitraum}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Datum</Text>
            <Text style={s.metaValue}>{data.datum}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Faellig am</Text>
            <Text style={s.metaValue}>{data.faelligAm}</Text>
          </View>
        </View>

        {/* Tabelle */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, s.colPos]}>Pos</Text>
          <Text style={[s.tableHeaderCell, s.colDatum]}>Datum Vollmacht</Text>
          <Text style={[s.tableHeaderCell, s.colFallNr]}>Fall-Nr</Text>
          <Text style={[s.tableHeaderCell, s.colKunde]}>Kunde</Text>
          <Text style={[s.tableHeaderCell, s.colBetrag]}>Betrag (netto)</Text>
        </View>
        {data.positionen.map((pos, i) => (
          <View key={i} style={s.tableRow}>
            <Text style={[s.tableCell, s.colPos]}>{pos.nr}</Text>
            <Text style={[s.tableCell, s.colDatum]}>{pos.vollmachtDatum}</Text>
            <Text style={[s.tableCell, s.colFallNr]}>{pos.fallNr || '—'}</Text>
            <Text style={[s.tableCell, s.colKunde]}>{pos.kundeName}</Text>
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
            <Text style={s.summenLabel}>MwSt. 19 %</Text>
            <Text style={s.summenValue}>{fmtEur(data.mwstBetrag)}</Text>
          </View>
          <View style={s.summenTotal}>
            <Text style={s.summenTotalLabel}>Gesamtbetrag</Text>
            <Text style={s.summenTotalValue}>{fmtEur(data.brutto)}</Text>
          </View>
        </View>

        {/* Zahlungshinweis */}
        <View style={s.zahlungsBlock}>
          <Text style={s.zahlungsTitle}>Zahlungshinweis</Text>
          <Text style={s.zahlungsText}>
            Zahlbar bis {data.faelligAm} via:
          </Text>
          <Text style={s.zahlungsLink}>{data.magicLinkUrl}</Text>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            Claimondo GmbH | Geschaeftsfuehrer: {gf} | Gerichtsstand: Koeln
          </Text>
        </View>
      </Page>
    </Document>
  )
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateKanzleiAbrechnungPdf(data: KanzleiPdfData): Promise<Buffer> {
  const missingEnvs: string[] = []
  if (!process.env.CLAIMONDO_FIRMENADRESSE) missingEnvs.push('CLAIMONDO_FIRMENADRESSE')
  if (!process.env.CLAIMONDO_USTID) missingEnvs.push('CLAIMONDO_USTID')
  if (missingEnvs.length > 0) {
    console.warn(`[KFZ-188 generate-pdf] Fehlende env vars: ${missingEnvs.join(', ')} — Platzhalter werden verwendet`)
  }

  const pdfBuffer = await renderToBuffer(<KanzleiAbrechnungPDF data={data} />)
  return Buffer.from(pdfBuffer)
}

/**
 * Generiert das PDF, laedt es nach Supabase Storage hoch und gibt den
 * Storage-Pfad zurueck. Gibt null zurueck wenn der Upload fehlschlaegt.
 */
export async function generateAndUploadKanzleiAbrechnungPdf(
  data: KanzleiPdfData,
  monat: number,
  jahr: number,
): Promise<string | null> {
  const supabase = createAdminClient()

  const pdfBuffer = await generateKanzleiAbrechnungPdf(data)

  const monatPad = String(monat).padStart(2, '0')
  const storagePath = `${jahr}/${monatPad}/${data.rechnungsnummer}.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('kanzlei-abrechnungen')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadErr) {
    console.error(`[KFZ-188 generate-pdf] Upload fehlgeschlagen:`, uploadErr.message)
    return null
  }

  console.log(`[KFZ-188 generate-pdf] PDF generiert und hochgeladen: ${storagePath}`)
  return storagePath
}
