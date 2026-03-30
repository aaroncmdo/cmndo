import { NextResponse } from 'next/server'

/**
 * Platzhalter-Route: Lexoffice Zahlungseingang-Abgleich.
 * Wird spaeter mit der Lexoffice API verbunden um
 * Zahlungseingaenge automatisch abzugleichen.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // TODO: Lexoffice API Integration
  // 1. Lexoffice API Client initialisieren (API Key aus env)
  // 2. Offene Rechnungen laden
  // 3. Zahlungseingaenge abgleichen
  // 4. Gutachter-Guthaben automatisch aufladen bei Anzahlung
  // 5. finance_monatsberichte aktualisieren

  return NextResponse.json({
    ok: true,
    message: 'Lexoffice Sync Platzhalter – API wird spaeter angebunden.',
    placeholder: true,
  })
}
