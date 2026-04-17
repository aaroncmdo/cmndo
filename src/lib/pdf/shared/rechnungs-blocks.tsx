import React from 'react'
import { Text, View, StyleSheet } from '@react-pdf/renderer'
import type { RechnungsKonfig } from '@/lib/billing/get-rechnungs-konfig'

/**
 * AAR-416: Gemeinsame PDF-Blöcke für Setup-Anzahlungs-Rechnung (AAR-401)
 * und — zukünftig — Monatsabrechnung (KFZ-149 Harmonisierung).
 * Liest die Stammdaten aus `rechnungs_konfiguration`.
 */

const NAVY = '#0D1B3E'
const ONDO = '#4573A2'

const s = StyleSheet.create({
  absenderBlock: { marginBottom: 20 },
  absenderLabel: {
    fontSize: 7,
    color: '#9ca3af',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  absenderLine: { fontSize: 9, color: '#374151', lineHeight: 1.5 },
  absenderBrand: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  zahlungsBlock: {
    marginTop: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    backgroundColor: '#f9fafb',
  },
  zahlungsTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginBottom: 6,
  },
  zahlungsRow: {
    fontSize: 9,
    color: '#374151',
    lineHeight: 1.55,
  },
  zahlungsHinweis: {
    fontSize: 8,
    color: '#6b7280',
    fontStyle: 'italic' as const,
    marginTop: 8,
    lineHeight: 1.4,
  },
  ustBlockRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  ustCol: { width: 220 },
  ustLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  ustLabel: { fontSize: 9, color: '#6b7280' },
  ustValue: {
    fontSize: 9,
    color: '#374151',
    fontFamily: 'Helvetica-Bold',
  },
  ustTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    borderTopColor: NAVY,
    paddingTop: 6,
    marginTop: 6,
  },
  ustTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  ustTotalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  footerNote: {
    position: 'absolute',
    bottom: 28,
    left: 50,
    right: 50,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: '#9ca3af',
    textAlign: 'center' as const,
    lineHeight: 1.4,
  },
})

export function AbsenderHeaderBlock({
  konfig,
}: {
  konfig: RechnungsKonfig
}) {
  return (
    <View style={s.absenderBlock}>
      <Text style={s.absenderBrand}>Claimondo</Text>
      <Text style={s.absenderLabel}>Rechnungssteller</Text>
      <Text style={s.absenderLine}>{konfig.firmenname}</Text>
      <Text style={s.absenderLine}>{konfig.strasse}</Text>
      <Text style={s.absenderLine}>
        {konfig.plz} {konfig.ort}
      </Text>
      {konfig.geschaeftsfuehrer ? (
        <Text style={s.absenderLine}>
          Geschäftsführer: {konfig.geschaeftsfuehrer}
        </Text>
      ) : null}
      {konfig.steuernummer ? (
        <Text style={s.absenderLine}>Steuer-Nr.: {konfig.steuernummer}</Text>
      ) : null}
      {konfig.ust_id ? (
        <Text style={s.absenderLine}>USt-IdNr.: {konfig.ust_id}</Text>
      ) : null}
      {konfig.hrb ? <Text style={s.absenderLine}>HRB: {konfig.hrb}</Text> : null}
    </View>
  )
}

export function ZahlungsempfaengerFooterBlock({
  konfig,
  istAnzahlung = false,
}: {
  konfig: RechnungsKonfig
  istAnzahlung?: boolean
}) {
  // Bei Anzahlungen (bereits per Stripe kassiert) ist der Block rein informativ.
  return (
    <View style={s.zahlungsBlock}>
      <Text style={s.zahlungsTitle}>
        {istAnzahlung
          ? 'Zahlungsempfänger (Treuhand — Übergangsregelung)'
          : 'Bankverbindung'}
      </Text>
      <Text style={s.zahlungsRow}>{konfig.zahlungsempfaenger_name}</Text>
      <Text style={s.zahlungsRow}>IBAN: {formatIban(konfig.zahlungsempfaenger_iban)}</Text>
      <Text style={s.zahlungsRow}>BIC: {konfig.zahlungsempfaenger_bic}</Text>
      <Text style={s.zahlungsRow}>Bank: {konfig.zahlungsempfaenger_bank}</Text>
      {konfig.zahlungsempfaenger_hinweis ? (
        <Text style={s.zahlungsHinweis}>{konfig.zahlungsempfaenger_hinweis}</Text>
      ) : null}
    </View>
  )
}

export function UstSummaryBlock({
  netto_cent,
  ust_cent,
  brutto_cent,
  ust_satz_pct,
}: {
  netto_cent: number
  ust_cent: number
  brutto_cent: number
  ust_satz_pct: number
}) {
  const fmt = (cent: number) =>
    new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cent / 100) + ' \u20AC'

  return (
    <View style={s.ustBlockRow}>
      <View style={s.ustCol}>
        <View style={s.ustLine}>
          <Text style={s.ustLabel}>Netto</Text>
          <Text style={s.ustValue}>{fmt(netto_cent)}</Text>
        </View>
        <View style={s.ustLine}>
          <Text style={s.ustLabel}>USt. {ust_satz_pct} %</Text>
          <Text style={s.ustValue}>{fmt(ust_cent)}</Text>
        </View>
        <View style={s.ustTotal}>
          <Text style={s.ustTotalLabel}>Gesamt brutto</Text>
          <Text style={s.ustTotalValue}>{fmt(brutto_cent)}</Text>
        </View>
      </View>
    </View>
  )
}

export function FooterNoteBlock({ konfig }: { konfig: RechnungsKonfig }) {
  const parts = [
    konfig.firmenname,
    konfig.geschaeftsfuehrer ? `Geschäftsführer: ${konfig.geschaeftsfuehrer}` : null,
    'Gerichtsstand: Köln',
  ].filter(Boolean)
  return (
    <View style={s.footerNote}>
      <Text style={s.footerText}>{parts.join(' | ')}</Text>
    </View>
  )
}

function formatIban(raw: string): string {
  const clean = raw.replace(/\s+/g, '')
  return clean.match(/.{1,4}/g)?.join(' ') ?? clean
}

// Re-export für einfacheren Import
export { NAVY, ONDO }
