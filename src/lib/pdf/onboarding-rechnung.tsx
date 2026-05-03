import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AbsenderHeaderBlock,
  ZahlungsempfaengerFooterBlock,
  UstSummaryBlock,
  FooterNoteBlock,
  NAVY,
  ONDO,
} from '@/lib/pdf/shared/rechnungs-blocks'
import type { RechnungsKonfig } from '@/lib/billing/get-rechnungs-konfig'
import { formatCentAsEur } from '@/lib/billing/calculate-ust'

/**
 * AAR-401: Setup-Anzahlungs-Rechnung (§14 UStG-konform).
 * Nutzt Shared-Blocks aus AAR-416 für Absender + Zahlungsempfänger + USt.
 */

export type OnboardingRechnungData = {
  konfig: RechnungsKonfig
  rechnungs_nr: string
  rechnungs_datum: Date
  leistungs_datum: Date
  typ: 'solo' | 'buero' | 'akademie'
  paket: string | null
  kontingent: number
  empfaenger: {
    name: string
    firma?: string | null
    strasse?: string | null
    plz?: string | null
    ort?: string | null
    steuernummer?: string | null
    ust_id?: string | null
  }
  netto_cent: number
  ust_cent: number
  brutto_cent: number
  ust_satz_pct: number
  stripe_bezahlt_am: Date
}

const s = StyleSheet.create({
  page: { padding: 50, paddingBottom: 80, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  rechnungTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: ONDO },
  rechnungSub: { fontSize: 8, color: '#9ca3af', marginTop: 2 },
  empfaengerBlock: { marginBottom: 22 },
  label: {
    fontSize: 7,
    color: '#9ca3af',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  empfLine: { fontSize: 10, color: '#374151', lineHeight: 1.5 },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  metaBlock: { marginRight: 28 },
  metaLabel: {
    fontSize: 7,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  metaValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 2 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f4f4f5',
  },
  tableCell: { fontSize: 9, color: '#374151' },
  colPos: { width: '5%' },
  colBeschreibung: { width: '55%' },
  colMenge: { width: '10%', textAlign: 'right' as const },
  colEinzel: { width: '15%', textAlign: 'right' as const },
  colSumme: { width: '15%', textAlign: 'right' as const },
  hinweis: { fontSize: 9, color: '#6b7280', marginTop: 20, lineHeight: 1.5 },
  bezahltBadge: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#dcfce7',
    borderRadius: 4,
  },
  bezahltText: { fontSize: 9, color: '#15803d', fontFamily: 'Helvetica-Bold' },
})

function fmtDate(d: Date): string {
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function paketLabel(paket: string | null): string {
  if (!paket) return 'Individuell'
  const map: Record<string, string> = {
    standard: 'Standard',
    pro: 'Pro',
    premium: 'Premium',
    individuell: 'Individuell',
  }
  return map[paket] ?? paket
}

function OnboardingRechnungPDF({ data }: { data: OnboardingRechnungData }) {
  const paket = paketLabel(data.paket)
  const beschreibung =
    `Onboarding-Anzahlung Paket ${paket} — ` +
    `Werbebudget-Vorauszahlung für ${data.kontingent} Fälle`

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Top-Row: Absender + Rechnungs-Titel */}
        <View style={s.topRow}>
          <AbsenderHeaderBlock konfig={data.konfig} />
          <View style={{ alignItems: 'flex-end' as const }}>
            <Text style={s.rechnungTitle}>ANZAHLUNGSRECHNUNG</Text>
            <Text style={s.rechnungSub}>§14 UStG</Text>
            <Text style={{ fontSize: 10, color: '#1a1a1a', marginTop: 8, fontFamily: 'Helvetica-Bold' }}>
              {data.rechnungs_nr}
            </Text>
          </View>
        </View>

        {/* Empfänger-Block */}
        <View style={s.empfaengerBlock}>
          <Text style={s.label}>Rechnungsempfänger</Text>
          {data.empfaenger.firma ? (
            <Text style={s.empfLine}>{data.empfaenger.firma}</Text>
          ) : null}
          <Text style={s.empfLine}>{data.empfaenger.name}</Text>
          {data.empfaenger.strasse ? (
            <Text style={s.empfLine}>{data.empfaenger.strasse}</Text>
          ) : null}
          {data.empfaenger.plz && data.empfaenger.ort ? (
            <Text style={s.empfLine}>
              {data.empfaenger.plz} {data.empfaenger.ort}
            </Text>
          ) : null}
          {data.empfaenger.steuernummer ? (
            <Text style={s.empfLine}>Steuer-Nr.: {data.empfaenger.steuernummer}</Text>
          ) : null}
          {data.empfaenger.ust_id ? (
            <Text style={s.empfLine}>USt-IdNr.: {data.empfaenger.ust_id}</Text>
          ) : null}
        </View>

        {/* Meta */}
        <View style={s.metaRow}>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Rechnungsdatum</Text>
            <Text style={s.metaValue}>{fmtDate(data.rechnungs_datum)}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Leistungsdatum</Text>
            <Text style={s.metaValue}>{fmtDate(data.leistungs_datum)}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Rechnungs-Nr.</Text>
            <Text style={s.metaValue}>{data.rechnungs_nr}</Text>
          </View>
        </View>

        {/* Positionen */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, s.colPos]}>Pos</Text>
          <Text style={[s.tableHeaderCell, s.colBeschreibung]}>Beschreibung</Text>
          <Text style={[s.tableHeaderCell, s.colMenge]}>Menge</Text>
          <Text style={[s.tableHeaderCell, s.colEinzel]}>Einzel netto</Text>
          <Text style={[s.tableHeaderCell, s.colSumme]}>Summe netto</Text>
        </View>
        <View style={s.tableRow}>
          <Text style={[s.tableCell, s.colPos]}>1</Text>
          <Text style={[s.tableCell, s.colBeschreibung]}>{beschreibung}</Text>
          <Text style={[s.tableCell, s.colMenge]}>1</Text>
          <Text style={[s.tableCell, s.colEinzel]}>
            {formatCentAsEur(data.netto_cent)}
          </Text>
          <Text style={[s.tableCell, s.colSumme]}>
            {formatCentAsEur(data.netto_cent)}
          </Text>
        </View>

        {/* USt-Summenblock */}
        <View style={{ marginTop: 14 }}>
          <UstSummaryBlock
            netto_cent={data.netto_cent}
            ust_cent={data.ust_cent}
            brutto_cent={data.brutto_cent}
            ust_satz_pct={data.ust_satz_pct}
          />
        </View>

        {/* Bezahlt-Badge */}
        <View style={s.bezahltBadge}>
          <Text style={s.bezahltText}>
            ✓ Bereits bezahlt via Stripe am {fmtDate(data.stripe_bezahlt_am)}
          </Text>
        </View>

        {/* Zahlungsempfänger (informativ bei Anzahlung) */}
        <ZahlungsempfaengerFooterBlock konfig={data.konfig} istAnzahlung />

        <Text style={s.hinweis}>
          Leistungszeitraum: Werbebudget-Vorauszahlung für zukünftige
          Fall-Vermittlungen. Die Verrechnung erfolgt monatlich über die
          reguläre Monatsabrechnung nach der Claimondo-Abrechnungs-Logik.
        </Text>

        <FooterNoteBlock konfig={data.konfig} />
      </Page>
    </Document>
  )
}

export async function generateOnboardingRechnungPdf(
  data: OnboardingRechnungData,
): Promise<Buffer> {
  const buf = await renderToBuffer(<OnboardingRechnungPDF data={data} />)
  return Buffer.from(buf)
}

/**
 * Generiert das PDF und lädt es in Storage-Bucket `onboarding-rechnungen` hoch.
 * Gibt den Storage-Pfad zurück oder null bei Upload-Fehler.
 */
export async function generateAndUploadOnboardingRechnungPdf(
  data: OnboardingRechnungData,
): Promise<{ pdf_buffer: Buffer; storage_path: string | null }> {
  const db = createAdminClient()
  const pdfBuffer = await generateOnboardingRechnungPdf(data)

  const jahr = data.rechnungs_datum.getFullYear()
  const storagePath = `${jahr}/${data.rechnungs_nr}.pdf`

  const { error } = await db.storage
    .from('onboarding-rechnungen')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (error) {
    console.error('[AAR-401] Onboarding-Rechnung-Upload fehlgeschlagen:', error.message)
    return { pdf_buffer: pdfBuffer, storage_path: null }
  }

  return { pdf_buffer: pdfBuffer, storage_path: storagePath }
}
