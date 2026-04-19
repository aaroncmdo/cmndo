import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * CarDentity Typ-A Abfrage (Mock)
 * Checks if a vehicle has prior damage based on FIN/VIN.
 * In production, this will call the real CarDentity API.
 */
export async function POST(request: Request) {
  try {
    const { fall_id, fin_vin } = await request.json()
    if (!fall_id || !fin_vin) {
      return NextResponse.json({ error: 'fall_id und fin_vin erforderlich' }, { status: 400 })
    }

    const supabase = await createClient()

    // Mock response: deterministic based on FIN hash
    const hash = fin_vin.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
    const hasVorschaden = hash % 3 !== 0 // ~66% chance of prior damage
    const anzahl = hasVorschaden ? (hash % 3) + 1 : 0

    const ergebnis = {
      fin_vin,
      abfrage_zeitpunkt: new Date().toISOString(),
      hat_vorschaeden: hasVorschaden,
      vorschaden_anzahl: anzahl,
      quelle: 'cardentity_typ_a_mock',
      details: hasVorschaden
        ? Array.from({ length: anzahl }, (_, i) => ({
            datum: new Date(Date.now() - (i + 1) * 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            art: ['Heckschaden', 'Frontschaden', 'Seitenschaden'][i % 3],
            schwere: ['leicht', 'mittel', 'schwer'][i % 3],
          }))
        : [],
    }

    // Update faelle with result
    const letzterDatum = hasVorschaden && ergebnis.details.length > 0
      ? ergebnis.details[0].datum
      : null

    await supabase
      .from('faelle')
      .update({
        vorschaden_geprueft: true,
        hat_vorschaeden: hasVorschaden,
        vorschaden_anzahl: anzahl,
        vorschaden_letzter_datum: letzterDatum,
        vorschaden_typ_a_ergebnis: ergebnis,
        cardentity_abfrage_am: new Date().toISOString(),
      })
      .eq('id', fall_id)

    // Add timeline entry
    await supabase.from('timeline').insert({
      fall_id,
      typ: 'vorschaden-pruefung',
      titel: hasVorschaden
        ? `Vorschaden gefunden (${anzahl})`
        : 'Kein Vorschaden gefunden',
      beschreibung: `CarDentity Typ-A Pruefung fuer FIN ${fin_vin}. ${hasVorschaden ? `${anzahl} Vorschaeden erkannt.` : 'Fahrzeug ist vorschadenfrei.'}`,
    })

    // If prior damage found, trigger Typ-B for detailed report
    if (hasVorschaden) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      fetch(`${baseUrl}/api/cardentity/typ-b`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fall_id, fin_vin }),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, ergebnis })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 }
    )
  }
}
