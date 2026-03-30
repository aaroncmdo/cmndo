import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * CarDentity Typ-B Abfrage (Mock)
 * Detailed prior damage history report.
 * Only triggered when Typ-A finds prior damage.
 * In production, this will call the real CarDentity API.
 */
export async function POST(request: Request) {
  try {
    const { fall_id, fin_vin } = await request.json()
    if (!fall_id || !fin_vin) {
      return NextResponse.json({ error: 'fall_id und fin_vin erforderlich' }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch existing Typ-A result
    const { data: fall } = await supabase
      .from('faelle')
      .select('vorschaden_anzahl, vorschaden_typ_a_ergebnis')
      .eq('id', fall_id)
      .single()

    const anzahl = fall?.vorschaden_anzahl ?? 1

    // Mock detailed report
    const bericht = {
      fin_vin,
      abfrage_zeitpunkt: new Date().toISOString(),
      quelle: 'cardentity_typ_b_mock',
      fahrzeug: {
        hersteller: fin_vin.startsWith('W') ? 'BMW' : 'Volkswagen',
        typ: 'PKW',
        erstzulassung: '2020-06-15',
      },
      vorschaeden: Array.from({ length: anzahl }, (_, i) => ({
        nr: i + 1,
        datum: new Date(Date.now() - (i + 1) * 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        art: ['Heckschaden', 'Frontschaden', 'Seitenschaden'][i % 3],
        schwere: ['leicht', 'mittel', 'schwer'][i % 3],
        reparaturkosten: (1500 + i * 800),
        repariert: i > 0,
        gutachter: `SV-${1000 + i}`,
        versicherung: ['Allianz', 'HUK-COBURG', 'AXA'][i % 3],
        beschreibung: `Vorschaden ${i + 1}: ${['Heckschaden durch Auffahrunfall', 'Frontschaden durch Kollision', 'Seitenschaden durch Parkunfall'][i % 3]}`,
      })),
      gesamtschadenhistorie: {
        anzahl_schaeden: anzahl,
        gesamtkosten: Array.from({ length: anzahl }, (_, i) => 1500 + i * 800).reduce((a, b) => a + b, 0),
        letzter_schaden: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
    }

    // Update faelle with Typ-B report
    await supabase
      .from('faelle')
      .update({
        vorschaden_typ_b_bericht: bericht,
      })
      .eq('id', fall_id)

    // Timeline entry
    await supabase.from('timeline').insert({
      fall_id,
      typ: 'vorschaden-bericht',
      titel: 'CarDentity Typ-B Bericht erstellt',
      beschreibung: `Detaillierter Vorschadenbericht fuer FIN ${fin_vin}. ${anzahl} Vorschaeden dokumentiert. Gesamtkosten: ${bericht.gesamtschadenhistorie.gesamtkosten} EUR.`,
    })

    return NextResponse.json({ success: true, bericht })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 }
    )
  }
}
