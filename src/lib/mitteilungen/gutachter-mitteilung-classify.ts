// Phase 5: gutachter_mitteilungen retired -> SV-Notifs gehen in die kanonische
// `mitteilungen`. Pure, testbare Routing-Entscheidung pro typ (NICHT 'use server',
// damit vitest sie ohne DB smoke-testen kann + kein Client-Bundle-undefined).
//
// Prinzip: repraesentiert der typ laufenden State-zu-loesen -> ist bereits als
// abgeleitete Action-Source (get_updates_action) abgedeckt -> DROP (nicht
// materialisieren, sonst Doppel-Eintrag). Sonst einmaliges FYI -> Info (kategorie
// 'update') mit Prioritaet.

export type GutachterMitteilungRouting =
  | { action: 'drop' }
  | { action: 'info'; prioritaet: 'normal' | 'hoch' }

const DERIVED_COVERED = new Set<string>([
  'kunde_chat_nachricht', // derived: unbeantw_nachricht (nachrichten.gelesen=false)
  'gutachten_erinnerung', // derived: gutachten_ueberfaellig
  'qc_nachbesserung', // derived: nachbesserung
  're_termin_kundenwahl', // derived: re_termin_wahl
])

const HOCH_PRIO = new Set<string>([
  'vorschaden_warnung',
  'paket_fast_voll',
  'guthaben_niedrig',
  'nachbesichtigung_beauftragt',
  'stellungnahme_beauftragt',
])

export function classifyGutachterMitteilung(typ: string): GutachterMitteilungRouting {
  if (DERIVED_COVERED.has(typ)) return { action: 'drop' }
  return { action: 'info', prioritaet: HOCH_PRIO.has(typ) ? 'hoch' : 'normal' }
}
