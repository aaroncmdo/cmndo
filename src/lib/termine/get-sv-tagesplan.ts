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
  adresse: string
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
        besichtigungsort_plz
      )
    `,
    )
    .eq('sv_id', svId)
    .gte('start_zeit', vonIso)
    .lte('start_zeit', bisIso)
    .in('status', ['bestaetigt', 'verlegung_pending'])
    .order('start_zeit', { ascending: true })

  if (error) {
    console.warn('[AAR-864] getSvTagesplan failed', error)
    return []
  }

  return (data ?? []).map((row) => {
    const fall = Array.isArray(row.faelle) ? row.faelle[0] : row.faelle
    const adresse = [fall?.besichtigungsort_adresse, fall?.besichtigungsort_plz]
      .filter(Boolean)
      .join(', ')
    return {
      id: row.id as string,
      fall_id: row.fall_id as string | null,
      start_zeit: row.start_zeit as string,
      end_zeit: row.end_zeit as string,
      status: row.status as string,
      adresse,
    }
  })
}
