import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from '@react-pdf/renderer'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ContractPdfData = {
  vorlage_typ: string         // z.B. 'nutzungsbedingungen' | 'kooperationsvertrag_buero'
  vorlage_titel: string
  vorlage_version: string
  inhalt_html: string         // Vertragstext (Markdown/HTML wird stripped)
  unterzeichner_name: string  // Name der unterschreibenden Person
  unterzeichner_rolle?: string // 'Solo-Sachverstaendiger' | 'Buero-Inhaber' | 'Akademie-Verwalter'
  unterzeichner_organisation?: string // Buero-Name / Akademie-Name (optional)
  unterschrift_datum: Date
  unterschrift_ip?: string | null
  signature_png_data_uri?: string | null  // data:image/png;base64,... (PNG aus SVG-Konvertierung)
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const NAVY = '#0D1B3E'

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  brand: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: NAVY },
  brandSub: { fontSize: 8, color: '#71717a', marginTop: 2 },
  meta: { fontSize: 8, color: '#71717a', textAlign: 'right' as const },
  // Title block
  titleBlock: { marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#52525b' },
  // Body
  body: { fontSize: 10, lineHeight: 1.6, color: '#27272a', marginBottom: 30 },
  paragraph: { marginBottom: 8 },
  // Signatur-Block
  signatureBlock: { marginTop: 30, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  signatureLabel: { fontSize: 8, color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 6 },
  signatureImage: { width: 240, height: 60, marginBottom: 6 },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: '#9ca3af', width: 240, marginBottom: 6, marginTop: 40 },
  signatureName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  signatureRole: { fontSize: 9, color: '#52525b', marginTop: 2 },
  signatureMeta: { fontSize: 8, color: '#9ca3af', marginTop: 12 },
  // Footer
  footer: { position: 'absolute' as const, bottom: 30, left: 50, right: 50, textAlign: 'center' as const, fontSize: 7, color: '#9ca3af', borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 8 },
})

// ─── HTML→Plaintext (sehr simpel) ───────────────────────────────────────────

function stripHtmlToParagraphs(html: string): string[] {
  // Block-Level-Tags zu Doppelnewlines
  const cleaned = html
    .replace(/<br\s*\/?>(\r?\n)?/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
  return cleaned.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
}

// ─── Komponente ─────────────────────────────────────────────────────────────

function ContractDoc({ data }: { data: ContractPdfData }) {
  const paragraphs = stripHtmlToParagraphs(data.inhalt_html)
  const datumStr = data.unterschrift_datum.toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brand}>Claimondo</Text>
            <Text style={s.brandSub}>Plattform fuer KFZ-Sachverstaendige</Text>
          </View>
          <View>
            <Text style={s.meta}>Vertragsversion {data.vorlage_version}</Text>
            <Text style={s.meta}>Datum: {datumStr}</Text>
          </View>
        </View>

        {/* Title */}
        <View style={s.titleBlock}>
          <Text style={s.title}>{data.vorlage_titel}</Text>
          <Text style={s.subtitle}>
            Unterzeichnet von {data.unterzeichner_name}
            {data.unterzeichner_organisation ? ` (${data.unterzeichner_organisation})` : ''}
          </Text>
        </View>

        {/* Body — Vertragstext */}
        <View style={s.body}>
          {paragraphs.map((p, i) => (
            <Text key={i} style={s.paragraph}>{p}</Text>
          ))}
        </View>

        {/* Signatur-Block */}
        <View style={s.signatureBlock}>
          <Text style={s.signatureLabel}>Unterschrift</Text>
          {data.signature_png_data_uri ? (
            <Image src={data.signature_png_data_uri} style={s.signatureImage} />
          ) : (
            <View style={s.signatureLine} />
          )}
          <Text style={s.signatureName}>{data.unterzeichner_name}</Text>
          {data.unterzeichner_rolle && (
            <Text style={s.signatureRole}>{data.unterzeichner_rolle}</Text>
          )}
          <Text style={s.signatureMeta}>
            Unterzeichnet am {datumStr}
            {data.unterschrift_ip ? ` · IP ${data.unterschrift_ip}` : ''}
          </Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>
            Claimondo · Vertragsversion {data.vorlage_version} · {datumStr} · Rechtsverbindlich elektronisch unterzeichnet
          </Text>
        </View>
      </Page>
    </Document>
  )
}

// ─── Render ─────────────────────────────────────────────────────────────────

export async function generateContractPdf(data: ContractPdfData): Promise<Buffer> {
  return await renderToBuffer(<ContractDoc data={data} />)
}
