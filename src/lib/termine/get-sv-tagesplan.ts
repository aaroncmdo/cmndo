// AAR-864: Tagesplan eines SV im Datumsfenster — mit Adresse pro Termin
// (Pflicht-Adresse aus faelle.besichtigungsort_*; Dispatch garantiert
// dass jeder Termin eine Adresse hat).

import type { SupabaseClient } from '@supabase/supabase-js'

export type TagesplanTermin = {
  id: string
  fall_id: string | null
  start_zeit: string
  end_zeit: string
  status: string
  /** Anzeige-Adresse (Geocoded String). */
  adresse: string
  /** Lat/Lng des Besichtigungsorts für Routen-Berechnung (Mapbox direkt). */
  lat: number | null
  lng: number | null
}

/**
 * Lädt alle aktiven Termine eines SV im Zeitfenster, sortiert nach
 * start_zeit. "Aktiv" = bestaetigt | verlegung_pending. verlegt-Slots
 * sind absichtlich draußen — sie blocken zwar den Slot im SV-Kalender,
 * sind aber für die Routen-Planung des neuen Vorschlags irrelevant.
 *
 * Adresse wird zu einem String komponiert: "<strasse>, <plz> <ort>".
 */
export async function getSvTagesplan(
  supabase: SupabaseClient,
  svId: string,
  vonIso: string,
  bisIso: string,
): Promise<TagesplanTermin[]> {
  const { data, error } = await supabase
    .from('gutachter_termine')
    .select(
      `
      id,
      fall_id,
      start_zeit,
      end_zeit,
      status,
      faelle!gutachter_termine_fall_id_fkey (
        besichtigungsort_adresse,
        besichtigungsort_lat,
        besichtigungsort_lng,
        claims:claim_id (
          schadenort_adresse,
          schadenort_plz,
          schadenort_ort
        )
      )
    `,
    )
    .eq('sv_id', svId)
    .gte('start_zeit', vonIso)
    .lte('start_zeit', bisIso)
    .in('status', ['bestaetigt', 'verlegung_pending'])
    .order('start_zeit', { ascending: true })

  if (error) {
    console.error('[AAR-864] getSvTagesplan failed', error)
    return []
  }
  console.log('[AAR-864] getSvTagesplan: svId =', svId, '| Rows =', (data ?? []).length)

  return (data ?? []).map((row) => {
    const fall = Array.isArray(row.faelle) ? row.faelle[0] : row.faelle
    // CMM-44 SP-A2 (Cluster 1): schadenort_* aus dem claims-Embed (SSoT).
    const fallClaim = Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims
    // Anzeige-Adresse (für UI). Routen-Berechnung läuft separat über lat/lng.
    const adresse =
      (fall?.besichtigungsort_adresse as string | null) ||
      [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort]
        .filter(Boolean)
        .join(', ')
    return {
      id: row.id as string,
      fall_id: row.fall_id as string | null,
      start_zeit: row.start_zeit as string,
      end_zeit: row.end_zeit as string,
      status: row.status as string,
      adresse,
      lat: (fall?.besichtigungsort_lat as number | null) ?? null,
      lng: (fall?.besichtigungsort_lng as number | null) ?? null,
    }
  })
}
