import { NextResponse } from 'next/server'
import { erstelleKanzleiAbrechnung } from '@/lib/abrechnung/kanzlei/erstelle-abrechnung'

export const dynamic = 'force-dynamic'

/**
 * KFZ-188: Cron-Job — generiert Kanzlei-Monatsabrechnungen fuer den Vormonat.
 *
 * Schedule (vercel.json): 0 9 1 * *  — 1. jeden Monats um 09:00 UTC
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Vormonat berechnen
  const heute = new Date()
  let monat = heute.getMonth() // getMonth() gibt 0-11 zurueck, Vormonat = aktuellerMonat-1
  let jahr = heute.getFullYear()
  if (monat === 0) {
    monat = 12
    jahr -= 1
  }
  // monat ist jetzt 1-basiert (Dezember=12 oder Jan->Vormonat=heute.getMonth()=1..12)

  try {
    const result = await erstelleKanzleiAbrechnung(monat, jahr)
    return NextResponse.json({
      ok: true,
      monat,
      jahr,
      ...result,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[KFZ-188 cron] erstelleKanzleiAbrechnung Fehler:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
