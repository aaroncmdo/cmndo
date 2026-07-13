// AAR-864: Tagesplan eines SV im Datumsfenster — mit Adresse pro Termin
// (Pflicht-Adresse aus gutachter_termine.besichtigungsort_* (SSoT) + claims.schadenort_*-
// Fallback; Dispatch garantiert dass jeder Termin eine Adresse hat).

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
      besichtigungsort_adresse,
      besichtigungsort_lat,
      besichtigungsort_lng,
      claims:claim_id (
        schadenort_adresse,
        schadenort_plz,
        schadenort_ort
      )
    `,
    )
    .eq('assignee_id', svId)
    .eq('assignee_typ', 'sachverstaendiger')
    .gte('start_zeit', vonIso)
    .lte('start_zeit', bisIso)
    .in('status', ['bestaetigt', 'verlegung_pending'])
    .order('start_zeit', { ascending: true })

  if (error) {
    console.error('[AAR-864] getSvTagesplan failed', error)
    return []
  }

  return (data ?? []).map((row) => {
    // CMM-49: besichtigungsort_* direkt vom gutachter_termine-Row (SSoT; fall-Tier tot),
    // schadenort_* via claims:claim_id-Embed (faelle-frei). 0-Loss verifiziert (faelle_ja_gt_nein=0).
    const claim = Array.isArray(row.claims) ? row.claims[0] : row.claims
    // Anzeige-Adresse (für UI). Routen-Berechnung läuft separat über lat/lng.
    const adresse =
      (row.besichtigungsort_adresse as string | null) ||
      [claim?.schadenort_adresse, claim?.schadenort_plz, claim?.schadenort_ort]
        .filter(Boolean)
        .join(', ')
    return {
      id: row.id as string,
      fall_id: row.fall_id as string | null,
      start_zeit: row.start_zeit as string,
      end_zeit: row.end_zeit as string,
      status: row.status as string,
      adresse,
      lat: (row.besichtigungsort_lat as number | null) ?? null,
      lng: (row.besichtigungsort_lng as number | null) ?? null,
    }
  })
}
