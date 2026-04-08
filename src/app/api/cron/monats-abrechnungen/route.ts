import { NextResponse } from 'next/server'
import { generiereMarketingAbrechnung, generiereKanzleiAbrechnungen } from '@/lib/finance/abrechnungen-generator'
import { generateAbrechnungPDF } from '@/lib/finance/abrechnung-pdf'
import { sendMarketingAbrechnung, sendKanzleiMonatsAbrechnung } from '@/lib/email/google/flows'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Prüfe ob heute der letzte Tag des Monats ist
  const heute = new Date()
  const morgen = new Date(heute)
  morgen.setDate(morgen.getDate() + 1)
  const istLetzterTag = heute.getMonth() !== morgen.getMonth()

  if (!istLetzterTag) {
    return NextResponse.json({ skipped: true, reason: 'not last day of month' })
  }

  const monat = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}`
  let marketingCount = 0
  let kanzleiCount = 0
  const errors: string[] = []

  // ─── Marketing (Maik) ────────────────────────────────────────────────
  try {
    const marketing = await generiereMarketingAbrechnung(monat)
    if (marketing) {
      await generateAbrechnungPDF(marketing.abrechnungId)
      await sendMarketingAbrechnung(marketing.abrechnungId)
      marketingCount = 1
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[monats-abrechnungen] Marketing-Fehler:', msg)
    errors.push(`Marketing: ${msg}`)
  }

  // ─── Kanzleien ───────────────────────────────────────────────────────
  try {
    const kanzleiAbrechnungen = await generiereKanzleiAbrechnungen(monat)
    for (const ka of kanzleiAbrechnungen) {
      try {
        await generateAbrechnungPDF(ka.abrechnungId)
        await sendKanzleiMonatsAbrechnung(ka.abrechnungId)
        kanzleiCount++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
        console.error(`[monats-abrechnungen] Kanzlei ${ka.kanzleiId} Fehler:`, msg)
        errors.push(`Kanzlei ${ka.kanzleiId}: ${msg}`)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[monats-abrechnungen] Kanzlei-Generator Fehler:', msg)
    errors.push(`Kanzlei-Generator: ${msg}`)
  }

  console.log(`[monats-abrechnungen] monat=${monat} marketing=${marketingCount} kanzlei=${kanzleiCount} errors=${errors.length}`)

  return NextResponse.json({
    monat,
    marketing: marketingCount,
    kanzlei: kanzleiCount,
    errors: errors.length > 0 ? errors : undefined,
  })
}
