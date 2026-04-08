import { NextResponse } from 'next/server'
import {
  sendKundeWelcome,
  sendSvAuftragszusammenfassung,
  sendSvAbrechnung,
  sendSvRechnung,
  sendKanzleiAuftragszusammenfassung,
  sendKanzleiAbrechnungRechnung,
} from '@/lib/email/google/flows'

export const dynamic = 'force-dynamic'

/**
 * KFZ-137: Test-Endpunkt fuer Email-Flows. Nur in Development.
 * POST /api/dev/test-email
 * Body: { template, fallId?, gutachterId?, kanzleiEmail?, abrechnungId?, rechnungId? }
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Nur in Development verfuegbar' }, { status: 403 })
  }

  const body = await request.json()
  const { template, fallId, gutachterId, kanzleiEmail, abrechnungId, rechnungId } = body

  try {
    switch (template) {
      case 'kunde_welcome':
        if (!fallId) return NextResponse.json({ error: 'fallId fehlt' }, { status: 400 })
        await sendKundeWelcome(fallId)
        break
      case 'sv_auftrag':
        if (!fallId || !gutachterId) return NextResponse.json({ error: 'fallId + gutachterId fehlen' }, { status: 400 })
        await sendSvAuftragszusammenfassung(fallId, gutachterId)
        break
      case 'sv_abrechnung':
        if (!abrechnungId) return NextResponse.json({ error: 'abrechnungId fehlt' }, { status: 400 })
        await sendSvAbrechnung(abrechnungId)
        break
      case 'sv_rechnung':
        if (!rechnungId) return NextResponse.json({ error: 'rechnungId fehlt' }, { status: 400 })
        await sendSvRechnung(rechnungId)
        break
      case 'kanzlei_auftrag':
        if (!fallId || !kanzleiEmail) return NextResponse.json({ error: 'fallId + kanzleiEmail fehlen' }, { status: 400 })
        await sendKanzleiAuftragszusammenfassung(fallId, kanzleiEmail)
        break
      case 'kanzlei_abrechnung':
        if (!abrechnungId) return NextResponse.json({ error: 'abrechnungId fehlt' }, { status: 400 })
        await sendKanzleiAbrechnungRechnung(abrechnungId)
        break
      default:
        return NextResponse.json({ error: `Unbekanntes Template: ${template}. Erlaubt: kunde_welcome, sv_auftrag, sv_abrechnung, sv_rechnung, kanzlei_auftrag, kanzlei_abrechnung` }, { status: 400 })
    }

    return NextResponse.json({ ok: true, template })
  } catch (err) {
    console.error('[KFZ-137] Test-Email Fehler:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' }, { status: 500 })
  }
}
