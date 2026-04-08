import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generiereMarketingAbrechnung, generiereKanzleiAbrechnungen } from '@/lib/finance/abrechnungen-generator'
import { generateAbrechnungPDF } from '@/lib/finance/abrechnung-pdf'
import { sendMarketingAbrechnung, sendKanzleiMonatsAbrechnung } from '@/lib/email/google/flows'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Nur in Development verfuegbar' }, { status: 403 })
  }

  let body: { monat?: string; empfaenger?: 'marketing' | 'kanzlei'; senden?: boolean } = {}
  try {
    body = await request.json()
  } catch { /* */ }

  const monat = body.monat || new Date().toISOString().slice(0, 7)
  const senden = body.senden ?? false
  const results: Array<{ typ: string; abrechnungId: string; sent: boolean }> = []

  // Marketing
  if (!body.empfaenger || body.empfaenger === 'marketing') {
    const marketing = await generiereMarketingAbrechnung(monat)
    if (marketing) {
      await generateAbrechnungPDF(marketing.abrechnungId)
      if (senden) {
        await sendMarketingAbrechnung(marketing.abrechnungId)
      }
      results.push({ typ: 'marketing', abrechnungId: marketing.abrechnungId, sent: senden })
    }
  }

  // Kanzlei
  if (!body.empfaenger || body.empfaenger === 'kanzlei') {
    const kanzleiAbrechnungen = await generiereKanzleiAbrechnungen(monat)
    for (const ka of kanzleiAbrechnungen) {
      await generateAbrechnungPDF(ka.abrechnungId)
      if (senden) {
        await sendKanzleiMonatsAbrechnung(ka.abrechnungId)
      }
      results.push({ typ: 'kanzlei', abrechnungId: ka.abrechnungId, sent: senden })
    }
  }

  // Alle Abrechnungen für den Monat laden
  const supabase = createAdminClient()
  const { data: alle } = await supabase
    .from('abrechnungen')
    .select('id, empfaenger_typ, empfaenger_name, abrechnungs_nr, summe_netto, summe_brutto, status, pdf_path')
    .gte('abrechnungs_zeitraum_start', `${monat}-01`)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    ok: true,
    monat,
    generiert: results,
    alleAbrechnungen: alle ?? [],
  })
}
