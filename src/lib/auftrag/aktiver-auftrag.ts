'use server'

// CMM-36: Liefert den aktiven Auftrag des SVs für den Always-on-GPS-Hook.
// "Aktiv" = bestätigter Termin, noch nicht angekommen, im Tagesfenster.
// Wird vom Layout-Hook geladen und alle paar Minuten erneuert.

import { createClient } from '@/lib/supabase/server'

export type AktiverAuftrag = {
  terminId: string
  fallId: string
  startZeit: string
  geschaetzteFahrtzeitMin: number | null
  zielLat: number | null
  zielLng: number | null
  zielAdresse: string | null
} | null

export async function getAktiverAuftrag(svId: string): Promise<AktiverAuftrag> {
  const supabase = await createClient()

  const von = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()  // 2 h zurück
  const bis = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() // 12 h voraus

  const { data: termin } = await supabase
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit, geschaetzte_fahrtzeit_min, sv_angekommen_am')
    .eq('sv_id', svId)
    .eq('typ', 'sv_begutachtung')
    .in('status', ['bestaetigt', 'reserviert'])
    .is('sv_angekommen_am', null)
    .gte('start_zeit', von)
    .lte('start_zeit', bis)
    .order('start_zeit', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!termin || !termin.fall_id) return null

  const { data: fall } = await supabase
    .from('faelle')
    .select('schadens_adresse, schadens_plz, schadens_ort, besichtigungsort_lat, besichtigungsort_lng')
    .eq('id', termin.fall_id)
    .maybeSingle()

  const zielAdresse =
    [fall?.schadens_adresse, fall?.schadens_plz, fall?.schadens_ort].filter(Boolean).join(', ') || null

  return {
    terminId: termin.id as string,
    fallId: termin.fall_id as string,
    startZeit: termin.start_zeit as string,
    geschaetzteFahrtzeitMin: (termin.geschaetzte_fahrtzeit_min as number | null) ?? null,
    zielLat: (fall?.besichtigungsort_lat as number | null) ?? null,
    zielLng: (fall?.besichtigungsort_lng as number | null) ?? null,
    zielAdresse,
  }
}
