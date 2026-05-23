// CMM-44 SP-I2: erster Row-Creator + Writer-Helper fuer kanzlei_faelle (1:1 pro Claim).
import type { SupabaseClient } from '@supabase/supabase-js'

/** Die kanzlei_faelle-Spalten (1:1 pro Claim). SP-I2: 11 AS/Mandat. SP-I3: +14 Regulierung/VS. SP-I4: +12 Eskalation. SP-I5: +6 Rüge. */
export const KANZLEI_FAELLE_COLS = [
  // SP-I2 — Anschlussschreiben + Mandat
  'anschlussschreiben_am', 'anschlussschreiben_url', 'anschlussschreiben_sendedatum',
  'anschlussschreiben_unterschrift', 'anschlussschreiben_ocr_am', 'as_geforderte_summe',
  'as_frist', 'as_vs_reaktion_text', 'as_salesforce_id', 'as_zuletzt_synced_am', 'mandatsnummer',
  // SP-I3 — Regulierung / VS-Reaktion / Kuerzung / Quote / Eskalationsstufe
  'regulierung_am', 'regulierung_angekuendigt_am', 'vs_eskalationsstufe', 'regulierungsweise',
  'vs_reaktion_typ', 'vs_reaktion_am', 'kuerzungs_betrag', 'vs_frist_bis', 'vs_kuerzung_grund',
  'vs_quote_prozent', 'vs_quote_grund', 'vs_quote_akzeptiert_am', 'vs_quote_betrag_ausgezahlt',
  'vs_kuerzungs_typ',
  // SP-I4 — Eskalations-Stufen (Tag 14/21/28: am + ergebnis + ergebnis_am + ergebnis_von)
  'eskalation_tag_14_am', 'eskalation_tag_14_ergebnis', 'eskalation_tag_14_ergebnis_am', 'eskalation_tag_14_ergebnis_von',
  'eskalation_tag_21_am', 'eskalation_tag_21_ergebnis', 'eskalation_tag_21_ergebnis_am', 'eskalation_tag_21_ergebnis_von',
  'eskalation_tag_28_am', 'eskalation_tag_28_ergebnis', 'eskalation_tag_28_ergebnis_am', 'eskalation_tag_28_ergebnis_von',
  // SP-I5 — Rüge (counter/frist_tage mit DB-Default 0/14)
  'ruege_erhalten_am', 'ruege_grund', 'ruege_gesendet_am', 'ruege_betrag', 'ruege_counter', 'ruege_frist_tage',
] as const

/** Trennt ein faelle-Update in {rest, kfUpdate}: die SP-I2-Spalten gehen auf kanzlei_faelle. */
export function peelKanzleiFaelleColumns(
  update: Record<string, unknown>,
): { rest: Record<string, unknown>; kfUpdate: Record<string, unknown> } {
  const rest: Record<string, unknown> = {}
  const kfUpdate: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(update)) {
    if ((KANZLEI_FAELLE_COLS as readonly string[]).includes(k)) kfUpdate[k] = v
    else rest[k] = v
  }
  return { rest, kfUpdate }
}

/** create-or-update der kanzlei_faelle-Row eines Claims. status='versicherungskontakt' beim Anlegen
 *  (UPDATE laesst status unangetastet). Sync-Trigger leitet fall_id ab. Nicht-fatal. */
export async function upsertKanzleiFall(
  db: SupabaseClient,
  claimId: string | null,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId) {
    console.warn(`[CMM-44 SP-I2] kein claim_id — ${Object.keys(fields).join(',')} skip`)
    return { ok: false, error: 'no_claim_id' }
  }
  if (Object.keys(fields).length === 0) return { ok: true }
  const { data: existing } = await db.from('kanzlei_faelle').select('id').eq('claim_id', claimId).maybeSingle()
  if (existing?.id) {
    const { error } = await db.from('kanzlei_faelle').update(fields).eq('id', existing.id)
    if (error) { console.error('[CMM-44 SP-I2] kanzlei_faelle update:', error.message); return { ok: false, error: error.message } }
  } else {
    const { error } = await db.from('kanzlei_faelle').insert({ claim_id: claimId, status: 'versicherungskontakt', ...fields })
    if (error) { console.error('[CMM-44 SP-I2] kanzlei_faelle insert:', error.message); return { ok: false, error: error.message } }
  }
  return { ok: true }
}
