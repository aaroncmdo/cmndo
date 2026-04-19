'use server'

// AAR-143: Hard-Gate-Speicherung extrahiert aus actions.ts.
// AAR-80 ursprünglich (Q1/Q2/Q3 mit Haftpflicht), AAR-124 erweitert um
// Unfallort + Polizei, AAR-138/W4 modernisiert (Q3 = Polizei-vor-Ort,
// fahrzeug_fahrbereit als Q2-Unterfeld).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { HardGateData } from './types'

export async function saveHardGate(
  leadId: string,
  data: HardGateData,
): Promise<{
  success: boolean
  disqualifiziert?: boolean
  grund?: string
  grundKey?: string
  error?: string
}> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // AAR-114: Disqualifikations-Check mit grund_key (Notion-Spec §2)
  let disqualifiziert = false
  let grund: string | undefined
  let grundKey: 'eigenverantwortung' | 'kein_schaden' | 'kein_haftpflicht' | undefined

  if (data.schuldfrage === 'eigenverantwortung') {
    disqualifiziert = true
    grund = 'Eigenverantwortung / Kasko-Fall'
    grundKey = 'eigenverantwortung'
  } else if (
    data.schaden_sichtbar === false &&
    !data.personenschaden_flag &&
    !data.mietwagen_flag &&
    !data.nutzungsausfall
  ) {
    disqualifiziert = true
    grund = 'Kein sichtbarer Schaden und keine Personenschaden/Mietwagen/Nutzungsausfall-Flags'
    grundKey = 'kein_schaden'
  } else if (data.hat_haftpflicht === false) {
    disqualifiziert = true
    grund = 'Kasko / eigene Versicherung — kein Haftpflichtschaden'
    grundKey = 'kein_haftpflicht'
  }

  const updates: Record<string, unknown> = {
    ...(data.unfallhergang !== undefined && { unfallhergang: data.unfallhergang }),
    ...(data.schuldfrage !== undefined && { schuldfrage: data.schuldfrage }),
    ...(data.aufklaerung_teilschuld_bestaetigt !== undefined && { aufklaerung_teilschuld_bestaetigt: data.aufklaerung_teilschuld_bestaetigt }),
    ...(data.schaden_sichtbar !== undefined && { schaden_sichtbar: data.schaden_sichtbar }),
    ...(data.personenschaden_flag !== undefined && { personenschaden_flag: data.personenschaden_flag }),
    ...(data.sachschaden_flag !== undefined && { sachschaden_flag: data.sachschaden_flag }),
    ...(data.sachschaden_beschreibung !== undefined && { sachschaden_beschreibung: data.sachschaden_beschreibung }),
    ...(data.mietwagen_flag !== undefined && { mietwagen_flag: data.mietwagen_flag }),
    ...(data.nutzungsausfall !== undefined && { nutzungsausfall: data.nutzungsausfall }),
    ...(data.hat_haftpflicht !== undefined && { hat_haftpflicht: data.hat_haftpflicht }),
    ...(data.unfallort !== undefined && { unfallort: data.unfallort }),
    ...(data.unfallort_kategorie !== undefined && { unfallort_kategorie: data.unfallort_kategorie }),
    ...(data.unfallort_lat !== undefined && { unfallort_lat: data.unfallort_lat }),
    ...(data.unfallort_lng !== undefined && { unfallort_lng: data.unfallort_lng }),
    ...(data.polizei_vor_ort !== undefined && { polizei_vor_ort: data.polizei_vor_ort }),
    ...(data.polizei_aktenzeichen !== undefined && { polizei_aktenzeichen: data.polizei_aktenzeichen }),
    ...(data.fahrzeug_fahrbereit !== undefined && { fahrzeug_fahrbereit: data.fahrzeug_fahrbereit }),
    ...(data.sv_treffpunkt !== undefined && { sv_treffpunkt: data.sv_treffpunkt }),
    updated_at: new Date().toISOString(),
  }

  // AAR-124 + AAR-138/W4: Polizei-Business-Regeln.
  if (data.polizei_vor_ort === false) {
    updates.polizeibericht_pflicht = false
    updates.polizei_aktenzeichen = null
  } else if (data.polizei_vor_ort === true) {
    updates.polizeibericht_pflicht =
      data.polizeibericht_pflicht !== undefined ? data.polizeibericht_pflicht : true
  } else if (data.polizeibericht_pflicht !== undefined) {
    updates.polizeibericht_pflicht = data.polizeibericht_pflicht
  }

  if (disqualifiziert) {
    updates.qualifizierungs_phase = 'disqualifiziert'
    updates.disqualifiziert_grund = grund
    updates.disqualifiziert_grund_key = grundKey
  } else {
    // AAR-114 + AAR-138/W4: Q3 ist Polizei-vor-Ort, gilt als beantwortet
    // sobald polizei_vor_ort true ODER false gesetzt ist.
    const q1Complete =
      !!data.unfallhergang &&
      !!data.schuldfrage &&
      (data.schuldfrage !== 'unklar' || data.aufklaerung_teilschuld_bestaetigt === true)
    const q2Complete = data.schaden_sichtbar !== null && data.schaden_sichtbar !== undefined
    const q3Complete = data.polizei_vor_ort === true || data.polizei_vor_ort === false

    if (q1Complete && q2Complete && q3Complete) {
      updates.qualifizierungs_phase = 'in-qualifizierung'
    }
  }

  const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
  if (error) return { success: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true, disqualifiziert, grund, grundKey }
}
