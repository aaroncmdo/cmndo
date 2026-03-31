import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { berechneLeadpreis } from '@/lib/leadpreis'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createServiceClient()
  const now = new Date()
  const monatStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monatEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const monatStr = monatStart.toISOString().slice(0, 10)

  // Get all active SVs
  const { data: svList } = await svc.from('sachverstaendige').select('id, paket_faelle_gesamt, paket_faelle_genutzt').eq('ist_aktiv', true)
  let created = 0

  for (const sv of svList ?? []) {
    // Check if abrechnung already exists for this month
    const { data: existing } = await svc.from('gutachter_monatsabrechnungen').select('id').eq('sv_id', sv.id).eq('monat', monatStr).maybeSingle()
    if (existing) continue

    // Get all Fälle with completed Termin this month
    const { data: faelle } = await svc.from('faelle')
      .select('id, fall_nummer, schadenshoehe_netto, kennzeichen, sv_termin, lead_id')
      .eq('sv_id', sv.id)
      .gte('sv_termin', monatStart.toISOString())
      .lte('sv_termin', monatEnd.toISOString())
      .not('status', 'in', '("storniert")')

    if (!faelle?.length) continue

    const kontingent = sv.paket_faelle_gesamt ?? 25
    let paketCount = 0; let einzelCount = 0
    let summePaket = 0; let summeEinzel = 0
    const positionen: { fall_id: string; kunde_name: string; kennzeichen: string; schadenshoehe: number; leadpreis: number; leadpreis_typ: string; termin_datum: string }[] = []

    for (const fall of faelle) {
      const schaden = Number(fall.schadenshoehe_netto) || 0
      const istImPaket = paketCount + einzelCount < kontingent
      const preis = berechneLeadpreis(schaden, istImPaket)
      const typ = istImPaket ? 'paket' : 'einzel'

      if (istImPaket) { paketCount++; summePaket += preis } else { einzelCount++; summeEinzel += preis }

      // Get kunde name
      let kundeName = '—'
      if (fall.lead_id) {
        const { data: lead } = await svc.from('leads').select('vorname, nachname').eq('id', fall.lead_id).single()
        if (lead) kundeName = [lead.vorname, lead.nachname].filter(Boolean).join(' ')
      }

      positionen.push({ fall_id: fall.id, kunde_name: kundeName, kennzeichen: fall.kennzeichen ?? '', schadenshoehe: schaden, leadpreis: preis, leadpreis_typ: typ, termin_datum: fall.sv_termin ?? '' })

      // Update Fall with leadpreis
      await svc.from('faelle').update({ leadpreis: preis, leadpreis_typ: typ }).eq('id', fall.id)
    }

    // Create Abrechnung
    const gesamt = summePaket + summeEinzel
    const faelligAm = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10)

    const { data: abr } = await svc.from('gutachter_monatsabrechnungen').insert({
      sv_id: sv.id, monat: monatStr, faelle_im_paket: paketCount, faelle_einzel: einzelCount,
      summe_paket: summePaket, summe_einzel: summeEinzel, gesamtbetrag: gesamt, faellig_am: faelligAm,
    }).select('id').single()

    if (abr) {
      for (const pos of positionen) {
        await svc.from('gutachter_abrechnungspositionen').insert({ abrechnung_id: abr.id, ...pos })
      }
    }
    created++
  }

  return NextResponse.json({ created })
}
