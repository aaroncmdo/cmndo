// Token-Audit-Skip: @react-pdf/renderer hat kein CSS-Var-Support — inline-hex Pflicht.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  AbsenderHeaderBlock,
  FooterNoteBlock,
  NAVY,
  ONDO,
} from '@/lib/pdf/shared/rechnungs-blocks'
import type { RechnungsKonfig } from '@/lib/billing/get-rechnungs-konfig'

// ─── Input type ──────────────────────────────────────────────────────────────

export type PartnerGutschriftPdfInput = {
  gutschrift_nr: string
  erstellt_am: string          // ISO; issue date
  leistung_datum: string | null // ISO date (YYYY-MM-DD) or null; §14 Abs. 4 Nr. 6 UStG
  leistung_text: string
  betrag_netto: number         // EUROS (row stores euros, not cents)
  ust_satz: number | null      // percentage (e.g. 19 / 0 / null)
  ust_betrag: number | null    // EUROS
  betrag_brutto: number        // EUROS
  empfaenger_snapshot: {
    name: string | null
    adresse_strasse: string | null
    adresse_plz: string | null
    adresse_ort: string | null
    ust_id: string | null
    ist_kleinunternehmer: boolean | null
    bank_iban: string | null
  }
  aussteller_snapshot: RechnungsKonfig   // full konfig (after step 0)
}

// ─── View model ──────────────────────────────────────────────────────────────

type RegelbesteuertSumme = {
  netto: string
  ustLabel: string
  ustBetrag: string
  brutto: string
}

type KleinunternehmerSumme = {
  netto: string
  brutto: string
  kleinunternehmerHinweis: string
}

export type GutschriftViewModel = {
  titel: string
  hinweisParagraph: string
  nummer: string
  datum: string
  leistungszeitraum: string
  empfaenger: string[]
  position: { text: string; netto: string }
  istKleinunternehmer: boolean
  summe: RegelbesteuertSumme | KleinunternehmerSumme
  auszahlungHinweis: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEur(euro: number): string {
  return (
    new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(euro) + ' €'
  )
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Formats a raw IBAN string into 4-character groups separated by spaces. */
function formatIban(raw: string): string {
  const stripped = raw.replace(/\s+/g, '')
  return stripped.match(/.{1,4}/g)?.join(' ') ?? stripped
}

// ─── Pure view-model builder (unit-testable, no PDF primitives) ───────────────

export function buildGutschriftViewModel(
  input: PartnerGutschriftPdfInput,
): GutschriftViewModel {
  const snap = input.empfaenger_snapshot
  const istKleinunternehmer = snap.ist_kleinunternehmer === true

  // Empfänger address lines
  const empfaenger: string[] = []
  if (snap.name) empfaenger.push(snap.name)
  if (snap.adresse_strasse) empfaenger.push(snap.adresse_strasse)
  if (snap.adresse_plz && snap.adresse_ort) {
    empfaenger.push(`${snap.adresse_plz} ${snap.adresse_ort}`)
  } else if (snap.adresse_ort) {
    empfaenger.push(snap.adresse_ort)
  }
  if (snap.ust_id) empfaenger.push(`USt-IdNr.: ${snap.ust_id}`)

  // Summe block — two branches
  const summe: RegelbesteuertSumme | KleinunternehmerSumme = istKleinunternehmer
    ? {
        netto: formatEur(input.betrag_netto),
        brutto: formatEur(input.betrag_brutto),
        kleinunternehmerHinweis: 'Kleinunternehmer gemäß §19 UStG — keine Umsatzsteuer',
      }
    : {
        netto: formatEur(input.betrag_netto),
        ustLabel: `USt. ${input.ust_satz} %`,
        ustBetrag: formatEur(input.ust_betrag ?? 0),
        brutto: formatEur(input.betrag_brutto),
      }

  // Leistungszeitraum: §14 Abs. 4 Nr. 6 UStG — Kalendermonat genuegt (§31 Abs. 4 UStDV)
  const leistungszeitraum = input.leistung_datum
    ? new Date(input.leistung_datum).toLocaleDateString('de-DE', {
        month: 'long',
        year: 'numeric',
      })
    : 'Leistungsdatum entspricht dem Ausstellungsdatum'

  // Auszahlungs-Hinweis: IBAN-aware wenn Empfaenger-IBAN im Snapshot hinterlegt
  const auszahlungHinweis = snap.bank_iban
    ? `Die Auszahlung erfolgt auf IBAN ${formatIban(snap.bank_iban)}.`
    : 'Die Auszahlung erfolgt auf das bei Claimondo hinterlegte Bankkonto.'

  return {
    titel: 'Gutschrift',
    hinweisParagraph: 'Gutschrift im Sinne des §14 Abs. 2 UStG',
    nummer: input.gutschrift_nr,
    datum: fmtDate(input.erstellt_am),
    leistungszeitraum,
    empfaenger,
    position: {
      text: input.leistung_text,
      netto: formatEur(input.betrag_netto),
    },
    istKleinunternehmer,
    summe,
    auszahlungHinweis,
  }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  colBeschreibung: { width: '75%' },
  colNetto: { width: '20%', textAlign: 'right' as const },
  summeBlock: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end' },
  summeCol: { width: 240 },
  summeLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  summeLabel: { fontSize: 9, color: '#6b7280' },
  summeValue: { fontSize: 9, color: '#374151', fontFamily: 'Helvetica-Bold' },
  summeTotalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    borderTopColor: NAVY,
    paddingTop: 6,
    marginTop: 6,
  },
  summeTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  summeTotalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  kuHinweis: { fontSize: 8, color: '#6b7280', fontStyle: 'italic' as const, marginTop: 4 },
  auszahlungHinweis: { fontSize: 9, color: '#6b7280', marginTop: 20, lineHeight: 1.5 },
})

// ─── PDF React component ──────────────────────────────────────────────────────

function PartnerGutschriftPdf({ input }: { input: PartnerGutschriftPdfInput }) {
  const vm = buildGutschriftViewModel(input)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Top-Row: Absender + Gutschrift-Titel */}
        <View style={s.topRow}>
          <AbsenderHeaderBlock konfig={input.aussteller_snapshot} />
          <View style={{ alignItems: 'flex-end' as const }}>
            <Text style={s.rechnungTitle}>{vm.titel.toUpperCase()}</Text>
            <Text style={s.rechnungSub}>§14 Abs. 2 UStG</Text>
            <Text style={{ fontSize: 10, color: '#1a1a1a', marginTop: 8, fontFamily: 'Helvetica-Bold' }}>
              {vm.nummer}
            </Text>
          </View>
        </View>

        {/* Empfänger-Block */}
        <View style={s.empfaengerBlock}>
          <Text style={s.label}>Gutschriftsempfänger</Text>
          {vm.empfaenger.map((line, i) => (
            <Text key={i} style={s.empfLine}>{line}</Text>
          ))}
        </View>

        {/* Meta */}
        <View style={s.metaRow}>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Gutschrift-Nr.</Text>
            <Text style={s.metaValue}>{vm.nummer}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Datum</Text>
            <Text style={s.metaValue}>{vm.datum}</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Leistungszeitraum</Text>
            <Text style={s.metaValue}>{vm.leistungszeitraum}</Text>
          </View>
        </View>

        {/* Positionen */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, s.colPos]}>Pos</Text>
          <Text style={[s.tableHeaderCell, s.colBeschreibung]}>Beschreibung</Text>
          <Text style={[s.tableHeaderCell, s.colNetto]}>Netto</Text>
        </View>
        <View style={s.tableRow}>
          <Text style={[s.tableCell, s.colPos]}>1</Text>
          <Text style={[s.tableCell, s.colBeschreibung]}>{vm.position.text}</Text>
          <Text style={[s.tableCell, s.colNetto]}>{vm.position.netto}</Text>
        </View>

        {/* Summen-Block: custom (kein UstSummaryBlock — der ist cent-basiert + kein KU-Zweig) */}
        <View style={s.summeBlock}>
          <View style={s.summeCol}>
            <View style={s.summeLine}>
              <Text style={s.summeLabel}>Netto</Text>
              <Text style={s.summeValue}>{vm.summe.netto}</Text>
            </View>
            {'ustLabel' in vm.summe ? (
              <View style={s.summeLine}>
                <Text style={s.summeLabel}>{vm.summe.ustLabel}</Text>
                <Text style={s.summeValue}>{vm.summe.ustBetrag}</Text>
              </View>
            ) : (
              <Text style={s.kuHinweis}>{vm.summe.kleinunternehmerHinweis}</Text>
            )}
            <View style={s.summeTotalLine}>
              <Text style={s.summeTotalLabel}>Gesamt brutto</Text>
              <Text style={s.summeTotalValue}>{vm.summe.brutto}</Text>
            </View>
          </View>
        </View>

        {/* Auszahlung-Hinweis */}
        <Text style={s.auszahlungHinweis}>{vm.auszahlungHinweis}</Text>

        <FooterNoteBlock konfig={input.aussteller_snapshot} />
      </Page>
    </Document>
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generatePartnerGutschriftPdf(
  input: PartnerGutschriftPdfInput,
): Promise<Buffer> {
  const buf = await renderToBuffer(<PartnerGutschriftPdf input={input} />)
  return Buffer.from(buf)
}

export async function generateAndUploadPartnerGutschriftPdf(
  input: PartnerGutschriftPdfInput,
): Promise<{ ok: true; pdfPath: string } | { ok: false; error: string }> {
  try {
    const buffer = await generatePartnerGutschriftPdf(input)
    const db = createAdminClient()
    const jahr = new Date(input.erstellt_am).getFullYear()
    const pdfPath = `partner-gutschriften/${jahr}/${input.gutschrift_nr}.pdf`

    const { error } = await db.storage
      .from('abrechnungen-pdf')
      .upload(pdfPath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, pdfPath }
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'Unbekannter Fehler' }
  }
}
