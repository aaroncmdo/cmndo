// SSoT für den Anzeige-Namen (+ Aktenzeichen) der Gegner-Versicherung.
//
// Post-CMM-49 liegt die Gegner-Versicherung kanonisch als
//   claims/leads.gegner_versicherung_id -> versicherungen.name
// mit Freitext-Fallback (leads.gegner_versicherung). Die View v_claim_full
// löst beides bereits auf: gegner_versicherung_name (resolved), gegner_versicherung
// (Freitext), gegner_versicherungsnummer. Wir delegieren an die View statt den
// Join zu duplizieren (SSoT — keine Drift zur View-Logik).
//
// Ersetzt das alte, doppelt tote Read-Pattern
//   from('parteien').select('versicherung_name').eq('rolle','gegner')
// — die `parteien`-Tabelle ist seit CMM-49 leer, UND 'gegner' ist kein gültiger
// `partei_rolle`-Enum-Wert (nur geschaedigter/schaediger) -> die Query lief immer
// ins Leere und die Versicherung war in jeder Mail/PDF '—'.
import type { SupabaseClient } from '@supabase/supabase-js'

export type GegnerVersicherung = { name: string | null; nummer: string | null }

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length > 0 ? s : null
}

/**
 * Liefert den Anzeige-Namen der Gegner-Versicherung (aufgelöster Name bevorzugt,
 * sonst Freitext) + das Versicherungs-Aktenzeichen. {name:null,nummer:null} wenn
 * nichts erfasst ist oder kein Key übergeben wurde (Caller rendert dann '—').
 *
 * db kann ein Service- oder ein authentifizierter Client sein — v_claim_full ist
 * für beide lesbar (Service sieht alles, authed via RLS die eigenen Claims).
 */
export async function resolveGegnerVersicherung(
  db: SupabaseClient,
  keys: { fallId?: string | null; claimId?: string | null },
): Promise<GegnerVersicherung> {
  const empty: GegnerVersicherung = { name: null, nummer: null }
  if (!keys.fallId && !keys.claimId) return empty

  let q = db
    .from('v_claim_full')
    .select('gegner_versicherung_name, gegner_versicherung, gegner_versicherungsnummer')
  q = keys.fallId ? q.eq('fall_id', keys.fallId) : q.eq('id', keys.claimId as string)

  const { data } = await q.maybeSingle()
  if (!data) return empty

  const row = data as {
    gegner_versicherung_name?: unknown
    gegner_versicherung?: unknown
    gegner_versicherungsnummer?: unknown
  }
  return {
    name: clean(row.gegner_versicherung_name) ?? clean(row.gegner_versicherung),
    nummer: clean(row.gegner_versicherungsnummer),
  }
}
