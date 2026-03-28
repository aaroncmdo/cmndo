import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'

// ─── Types ──────────────────────────────────────────────────────────────────

export type KanzleiPaketData = {
  fallNummer: string
  datum: string
  status: string
  // Parteien
  geschaedigter: { name: string; email: string | null; telefon: string | null } | null
  schaediger: { name: string; versicherung: string | null; versicherungNr: string | null; telefon: string | null; email: string | null } | null
  // Schaden
  schadensUrsache: string | null
  schadensBeschreibung: string | null
  schadensDatum: string | null
  schadensAdresse: string | null
  // Positionen
  positionen: { kategorie: string; bezeichnung: string | null; beschreibung: string | null; geschaetzterWert: number | null; reparaturkosten: number | null }[]
  // Gutachten
  gutachtenBetrag: number | null
  gutachtenDatum: string | null
  svName: string | null
  // Beweise
  beweise: { typ: string; name: string | null }[]
  // Fotos
  fotoUrls: string[]
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  coverPage: { padding: 40, fontFamily: 'Helvetica', justifyContent: 'center', alignItems: 'center' },
  logo: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: '#09090b', marginBottom: 8 },
  coverSub: { fontSize: 12, color: '#71717a', marginBottom: 40 },
  coverFall: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#09090b' },
  coverDatum: { fontSize: 11, color: '#71717a', marginTop: 8 },
  h1: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 10, marginTop: 20, color: '#09090b', borderBottomWidth: 1, borderBottomColor: '#e4e4e7', paddingBottom: 4 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 6, marginTop: 12, color: '#27272a' },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 140, color: '#71717a', fontSize: 9 },
  value: { flex: 1, fontSize: 10, color: '#09090b' },
  table: { marginTop: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f4f4f5', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#e4e4e7' },
  tableRow: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#f4f4f5' },
  thCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#52525b' },
  tdCell: { fontSize: 9, color: '#27272a' },
  col1: { width: '25%' },
  col2: { width: '35%' },
  col3: { width: '20%', textAlign: 'right' },
  col4: { width: '20%', textAlign: 'right' },
  check: { flexDirection: 'row', marginBottom: 2 },
  checkBox: { width: 10, height: 10, borderWidth: 1, borderColor: '#22c55e', backgroundColor: '#dcfce7', marginRight: 6 },
  checkLabel: { fontSize: 9, color: '#27272a' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  photo: { width: 160, height: 120, objectFit: 'cover', borderRadius: 4 },
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#a1a1aa' },
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtCurrency(val: number | null) {
  if (val == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const URSACHE: Record<string, string> = {
  wasserschaden: 'Wasserschaden', sachbeschaedigung: 'Sachbeschädigung', brand: 'Brand',
  einbruch: 'Einbruch', sturmschaden: 'Sturmschaden', vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiß', sonstiges: 'Sonstiges',
}

// ─── Document ───────────────────────────────────────────────────────────────

export function KanzleiPaketPDF({ data }: { data: KanzleiPaketData }) {
  return (
    <Document>
      {/* Deckblatt */}
      <Page size="A4" style={s.coverPage}>
        <Text style={s.logo}>Claimondo</Text>
        <Text style={s.coverSub}>Kanzlei-Paket</Text>
        <Text style={s.coverFall}>Fall {data.fallNummer}</Text>
        <Text style={s.coverDatum}>{data.datum}</Text>
        <View style={s.footer}>
          <Text>Claimondo GmbH — Vertraulich</Text>
          <Text>Erstellt am {data.datum}</Text>
        </View>
      </Page>

      {/* Inhalt */}
      <Page size="A4" style={s.page}>
        {/* 1. Parteien */}
        <Text style={s.h1}>Parteien</Text>

        <Text style={s.h2}>Geschädigter</Text>
        {data.geschaedigter ? (
          <View>
            <View style={s.row}><Text style={s.label}>Name</Text><Text style={s.value}>{data.geschaedigter.name}</Text></View>
            {data.geschaedigter.email && <View style={s.row}><Text style={s.label}>E-Mail</Text><Text style={s.value}>{data.geschaedigter.email}</Text></View>}
            {data.geschaedigter.telefon && <View style={s.row}><Text style={s.label}>Telefon</Text><Text style={s.value}>{data.geschaedigter.telefon}</Text></View>}
          </View>
        ) : <Text style={s.value}>Keine Daten</Text>}

        <Text style={s.h2}>Schädiger / Versicherung</Text>
        {data.schaediger ? (
          <View>
            <View style={s.row}><Text style={s.label}>Name</Text><Text style={s.value}>{data.schaediger.name}</Text></View>
            {data.schaediger.versicherung && <View style={s.row}><Text style={s.label}>Versicherung</Text><Text style={s.value}>{data.schaediger.versicherung}</Text></View>}
            {data.schaediger.versicherungNr && <View style={s.row}><Text style={s.label}>Versicherungsnr.</Text><Text style={s.value}>{data.schaediger.versicherungNr}</Text></View>}
          </View>
        ) : <Text style={s.value}>Keine Daten</Text>}

        {/* 2. Schadensbeschreibung */}
        <Text style={s.h1}>Schadensbeschreibung</Text>
        <View style={s.row}><Text style={s.label}>Schadensart</Text><Text style={s.value}>{URSACHE[data.schadensUrsache ?? ''] ?? data.schadensUrsache ?? '—'}</Text></View>
        <View style={s.row}><Text style={s.label}>Schadensdatum</Text><Text style={s.value}>{fmtDate(data.schadensDatum)}</Text></View>
        <View style={s.row}><Text style={s.label}>Schadensort</Text><Text style={s.value}>{data.schadensAdresse ?? '—'}</Text></View>
        {data.schadensBeschreibung && (
          <View style={{ marginTop: 6 }}>
            <Text style={s.label}>Beschreibung</Text>
            <Text style={{ ...s.value, marginTop: 2 }}>{data.schadensBeschreibung}</Text>
          </View>
        )}

        {/* 3. Schadenspositionen */}
        {data.positionen.length > 0 && (
          <View>
            <Text style={s.h1}>Schadenspositionen</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={{ ...s.thCell, ...s.col1 }}>Kategorie</Text>
                <Text style={{ ...s.thCell, ...s.col2 }}>Bezeichnung</Text>
                <Text style={{ ...s.thCell, ...s.col3 }}>Wert</Text>
                <Text style={{ ...s.thCell, ...s.col4 }}>Reparatur</Text>
              </View>
              {data.positionen.map((p, i) => (
                <View key={i} style={s.tableRow}>
                  <Text style={{ ...s.tdCell, ...s.col1 }}>{p.kategorie}</Text>
                  <Text style={{ ...s.tdCell, ...s.col2 }}>{p.bezeichnung ?? p.beschreibung ?? '—'}</Text>
                  <Text style={{ ...s.tdCell, ...s.col3 }}>{fmtCurrency(p.geschaetzterWert)}</Text>
                  <Text style={{ ...s.tdCell, ...s.col4 }}>{fmtCurrency(p.reparaturkosten)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 4. Beweislage */}
        <Text style={s.h1}>Beweislage</Text>
        {data.beweise.length > 0 ? data.beweise.map((b, i) => (
          <View key={i} style={s.check}>
            <View style={s.checkBox} />
            <Text style={s.checkLabel}>{b.name ?? b.typ}</Text>
          </View>
        )) : <Text style={s.value}>Keine Beweise erfasst</Text>}

        {/* 5. Gutachten */}
        <Text style={s.h1}>Gutachten</Text>
        <View style={s.row}><Text style={s.label}>Sachverständiger</Text><Text style={s.value}>{data.svName ?? '—'}</Text></View>
        <View style={s.row}><Text style={s.label}>Gutachten-Betrag</Text><Text style={s.value}>{fmtCurrency(data.gutachtenBetrag)}</Text></View>
        <View style={s.row}><Text style={s.label}>Eingegangen am</Text><Text style={s.value}>{fmtDate(data.gutachtenDatum)}</Text></View>

        <View style={s.footer}>
          <Text>Claimondo GmbH — Fall {data.fallNummer}</Text>
          <Text>Seite 2</Text>
        </View>
      </Page>

      {/* Fotos */}
      {data.fotoUrls.length > 0 && (
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>Schadensfotos</Text>
          <View style={s.photoGrid}>
            {data.fotoUrls.map((url, i) => (
              <Image key={i} src={url} style={s.photo} />
            ))}
          </View>
          <View style={s.footer}>
            <Text>Claimondo GmbH — Fall {data.fallNummer}</Text>
            <Text>Fotos</Text>
          </View>
        </Page>
      )}
    </Document>
  )
}
