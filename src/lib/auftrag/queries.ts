// CMM-32: Loader-Lib für die auftraege-Sub-Entity.
// Single Source für SV-Auftrags-Daten. Konsumenten (SV-Portal,
// Dispatch, Admin, Kunde-Stepper) gehen über diese Funktionen, nicht
// direkt gegen die Tabelle, damit Lifecycle-Logik zentral bleibt.

import type { SupabaseClient } from '@supabase/supabase-js'

export type AuftragRow = {
  id: string
  fall_id: string
  sv_id: string
  typ: 'erstgutachten' | 'nachbesichtigung' | 'stellungnahme'
  status: 'termin' | 'besichtigung' | 'gutachten' | 'abgeschlossen'
  reihenfolge: number
  vorheriger_auftrag_id: string | null
  gutachten_url: string | null
  gutachten_final_freigegeben: boolean
  abgeschlossen_am: string | null
  erstellt_am: string
  updated_at: string
}

const AUFTRAG_SELECT =
  'id, fall_id, sv_id, typ, status, reihenfolge, vorheriger_auftrag_id, ' +
  'gutachten_url, gutachten_final_freigegeben, abgeschlossen_am, erstellt_am, updated_at'

/** Alle Aufträge eines Falls, sortiert nach Reihenfolge (1 = ältester). */
export async function getAlleAuftraege(
  supabase: SupabaseClient,
  fallId: string,
): Promise<AuftragRow[]> {
  const { data, error } = await supabase
    .from('auftraege')
    .select(AUFTRAG_SELECT)
    .eq('fall_id', fallId)
    .order('reihenfolge', { ascending: true })
  if (error) {
    console.error('[auftrag/queries] getAlleAuftraege:', error.message)
    return []
  }
  return ((data ?? []) as unknown) as AuftragRow[]
}

/** Aktiver (nicht-abgeschlossener) Auftrag mit höchster reihenfolge. */
export async function getAktivenAuftrag(
  supabase: SupabaseClient,
  fallId: string,
): Promise<AuftragRow | null> {
  const { data, error } = await supabase
    .from('auftraege')
    .select(AUFTRAG_SELECT)
    .eq('fall_id', fallId)
    .neq('status', 'abgeschlossen')
    .order('reihenfolge', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[auftrag/queries] getAktivenAuftrag:', error.message)
    return null
  }
  return (data as AuftragRow | null) ?? null
}

/** Einzelner Auftrag per ID. */
export async function getAuftrag(
  supabase: SupabaseClient,
  auftragId: string,
): Promise<AuftragRow | null> {
  const { data, error } = await supabase
    .from('auftraege')
    .select(AUFTRAG_SELECT)
    .eq('id', auftragId)
    .maybeSingle()
  if (error) {
    console.error('[auftrag/queries] getAuftrag:', error.message)
    return null
  }
  return (data as AuftragRow | null) ?? null
}

/**
 * Nächster aktiver Auftrag für einen SV (für CMM-36-Tracking-Hook).
 * Bestätigte/reservierte Termine, im Tagesfenster, noch nicht angekommen.
 */
export async function getNaechsterAktivenAuftragForSv(
  supabase: SupabaseClient,
  svId: string,
): Promise<{
  auftrag: AuftragRow
  terminId: string
  startZeit: string
  geschaetzteFahrtzeitMin: number | null
} | null> {
  const von = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const bis = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
  const { data: termin } = await supabase
    .from('gutachter_termine')
    .select('id, start_zeit, geschaetzte_fahrtzeit_min, auftrag_id')
    .eq('sv_id', svId)
    .eq('typ', 'sv_begutachtung')
    .in('status', ['bestaetigt', 'reserviert'])
    .is('sv_angekommen_am', null)
    .gte('start_zeit', von)
    .lte('start_zeit', bis)
    .not('auftrag_id', 'is', null)
    .order('start_zeit', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!termin?.auftrag_id) return null

  const auftrag = await getAuftrag(supabase, termin.auftrag_id as string)
  if (!auftrag) return null

  return {
    auftrag,
    terminId: termin.id as string,
    startZeit: termin.start_zeit as string,
    geschaetzteFahrtzeitMin: (termin.geschaetzte_fahrtzeit_min as number | null) ?? null,
  }
}
