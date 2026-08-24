import type { Db } from '../anreicherung/schreiben'

export type Standort = {
  lat: number
  lng: number
  ort: string | null
  plz: string | null
}

/**
 * PLZ oder Ort → Koordinaten, aus der bestehenden Tabelle `plz_geo`.
 *
 * F-01 nennt sie als Quelle vor jedem Geocoding — sie ist kostenlos und
 * enthaelt die deutschen Postleitzahlen bereits.
 *
 * ⚠ Ein unbekannter Ort ergibt `null`, nicht 0/0. Eine geratene Koordinate
 * waere schlimmer als keine: alle Umkreis-Module wuerden im Golf von Guinea
 * messen und plausible Zahlen liefern (R-B).
 */
export async function loeseStandortAuf(
  db: Db,
  eingabe: { plz?: string; ort?: string },
): Promise<Standort | null> {
  const plz = eingabe.plz?.trim()
  const ort = eingabe.ort?.trim()

  if (plz) {
    const { data } = await db
      .from('plz_geo')
      .select('plz,lat,lng,ort')
      .eq('plz', plz)
      .maybeSingle()

    if (data) return zuStandort(data as RohGeo)
  }

  if (ort) {
    // ⚠ KEIN maybeSingle: `ort` ist nicht eindeutig. An den echten Daten
    // gemessen (18.08.) trifft 'Münster' 16 Zeilen — jede Stadt hat mehrere
    // Postleitzahlen, und maybeSingle wirft dann "more than one row". Die
    // Ortssuche waere fuer praktisch jede Stadt kaputt gewesen.
    //
    // Sortiert nach PLZ und die erste genommen: innerhalb einer Stadt liegen
    // die niedrigen Nummern zentrumsnah, und fuer einen 25-50-km-Umkreis ist
    // der Unterschied zwischen zwei Stadtteilen ohnehin bedeutungslos.
    const { data } = await db
      .from('plz_geo')
      .select('plz,lat,lng,ort')
      .eq('ort', ort)
      .order('plz', { ascending: true })
      .limit(1)

    const treffer = Array.isArray(data) ? data[0] : data
    if (treffer) return zuStandort(treffer as RohGeo)
  }

  return null
}

type RohGeo = { plz?: string; lat: number | string; lng: number | string; ort?: string | null }

function zuStandort(d: RohGeo): Standort {
  // plz_geo fuehrt lat/lng als numeric — supabase-js liefert das als String.
  return {
    lat: Number(d.lat),
    lng: Number(d.lng),
    ort: d.ort ?? null,
    plz: d.plz ?? null,
  }
}
