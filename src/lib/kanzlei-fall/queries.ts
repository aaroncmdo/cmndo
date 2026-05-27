// CMM-32: Loader-Lib für die kanzlei_faelle-Sub-Entity.
// Single Source für den Regulierungs-Lifecycle (versicherungskontakt → auszahlung).

import type { SupabaseClient } from '@supabase/supabase-js'

export type KanzleiFallRow = {
  id: string
  fall_id: string
  status: 'versicherungskontakt' | 'auszahlung'
  vs_kontakt_am: string | null
  ausgezahlt_am: string | null
  erstellt_am: string
  updated_at: string
  // CMM-44 MP-2: Regulierungs-Trigger-Felder. Owning-Entity = kanzlei_faelle
  // (additive CMM-44-Migration; die gleichnamigen faelle-Spalten sterben in
  // Phase 6). Der re-basete subphase-resolver (Phasen 5/6/7) liest sie von hier
  // statt aus der sterbenden v_faelle_mit_aktuellem_termin-View.
  vs_reaktion_typ?: string | null
  vs_reaktion_am?: string | null
  vs_kuerzungs_typ?: string | null
  kuerzungs_betrag?: number | null
  vs_kuerzung_grund?: string | null
  vs_quote_prozent?: number | null
  vs_quote_akzeptiert_am?: string | null
  vs_quote_betrag_ausgezahlt?: number | null
  vs_quote_grund?: string | null
  vs_frist_bis?: string | null
  ruege_counter?: number | null
  ruege_gesendet_am?: string | null
  ruege_grund?: string | null
  anschlussschreiben_am?: string | null
  anschlussschreiben_sendedatum?: string | null
  eskalation_tag_14_am?: string | null
  eskalation_tag_21_am?: string | null
  eskalation_tag_28_am?: string | null
  mandatsnummer?: string | null
  lexdrive_case_id?: string | null
}

const SELECT =
  'id, fall_id, status, vs_kontakt_am, ausgezahlt_am, erstellt_am, updated_at, ' +
  'vs_reaktion_typ, vs_reaktion_am, vs_kuerzungs_typ, kuerzungs_betrag, vs_kuerzung_grund, ' +
  'vs_quote_prozent, vs_quote_akzeptiert_am, vs_quote_betrag_ausgezahlt, vs_quote_grund, vs_frist_bis, ' +
  'ruege_counter, ruege_gesendet_am, ruege_grund, ' +
  'anschlussschreiben_am, anschlussschreiben_sendedatum, ' +
  'eskalation_tag_14_am, eskalation_tag_21_am, eskalation_tag_28_am, ' +
  'mandatsnummer, lexdrive_case_id'

/** Kanzlei-Fall zu einem fall (UNIQUE — null wenn noch nicht in Regulierung). */
export async function getKanzleiFall(
  supabase: SupabaseClient,
  fallId: string,
): Promise<KanzleiFallRow | null> {
  const { data, error } = await supabase
    .from('kanzlei_faelle')
    .select(SELECT)
    .eq('fall_id', fallId)
    .maybeSingle()
  if (error) {
    console.error('[kanzlei-fall/queries] getKanzleiFall:', error.message)
    return null
  }
  return (data as KanzleiFallRow | null) ?? null
}
