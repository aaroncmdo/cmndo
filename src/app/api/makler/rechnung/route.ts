// Makler-Provisions-Rechnung als PDF-Download. Der Makler stellt Claimondo eine Rechnung
// ueber seine freigegebenen (abrechenbaren) Provisionen. Vorausgefuellt mit Positionen +
// Aussteller-Stammdaten; fehlende Felder (USt-IdNr, IBAN) sind im PDF als Platzhalter markiert.
// Auth: die aktive Makler-Session (getCurrentMakler, RLS-scoped).

import { NextResponse } from 'next/server'
import { getCurrentMakler, getMaklerRechnungData } from '@/lib/makler/queries'
import { generateMaklerRechnungPdf } from '@/lib/makler/rechnung-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const makler = await getCurrentMakler()
  if (!makler) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 })

  const rd = await getMaklerRechnungData(makler.id)
  if (!rd) return NextResponse.json({ error: 'Makler nicht gefunden.' }, { status: 404 })
  if (rd.positionen.length === 0) {
    return NextResponse.json(
      { error: 'Keine abrechenbaren (freigegebenen) Provisionen vorhanden.' },
      { status: 400 },
    )
  }

  const now = new Date()
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  // Deterministische Claimondo-Referenz (kein globaler Rechnungs-Zaehler-Verbrauch pro Download).
  const rechnungsnummer = `CMDO-${makler.id.slice(0, 8).toUpperCase()}-${yyyymmdd}`
  const datum = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(now)
  const leistungszeitraum = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(now)
  const mwstBetrag = Math.round(rd.nettoGesamt * 0.19 * 100) / 100
  const brutto = Math.round((rd.nettoGesamt + mwstBetrag) * 100) / 100

  const pdf = await generateMaklerRechnungPdf({
    rechnungsnummer,
    datum,
    leistungszeitraum,
    makler: rd.makler,
    positionen: rd.positionen,
    nettoGesamt: rd.nettoGesamt,
    mwstBetrag,
    brutto,
  })

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Provisionsabrechnung-${yyyymmdd}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
