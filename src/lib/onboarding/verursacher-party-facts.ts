// CMM-49 Feststellung-doppelt (Increment 3): Gegner-Fakten aus dem kunde-onboarding
// landen auf der verursacher-claim_party (kanonisches SSoT) — NICHT auf flat claims.
// v_claim_full liest die Gegner-Felder bereits von dort (gp-LATERAL auf rolle='verursacher'):
//   gegner_kennzeichen          = COALESCE(gveh.kennzeichen_aktuell, gp.kennzeichen)
//   gegner_versicherung         = COALESCE(gv.name, gp.versicherung_klartext)
//   gegner_versicherungsnummer  = COALESCE(gp.versicherungsnummer, claims.gegner_versicherungsnummer)
// -> ein onboarding-Write auf die Party ist sofort sichtbar, OHNE v_claim_full-Aenderung
//    (= keine Kollision mit der laufenden gegner-Cutover-Lane).
//
// Diese Datei haelt NUR die reine Build-Logik (Allowlist + Coercion), damit sie ohne
// 'use server'-IO unit-testbar ist. Konstanten/Helper duerfen nicht aus dem
// 'use server'-saveStep.ts exportiert werden (AAR-664) — daher hier.

import type { OnboardingFeld } from '@/components/onboarding/types'

// Harte Allowlist (Defense-in-Depth ZUSAETZLICH zur onboarding_felder-Config): welche
// verursacher-claim_party-Spalten das kunde-onboarding ueberhaupt schreiben darf. NUR die
// kanonisierten Gegner-Felder, die v_claim_full party-sourct. Bewusst NICHT versicherung_id
// (FK — braucht Resolver) / vehicle_id / person_id etc.
export const PARTY_ONBOARDING_WRITABLE = new Set<string>([
  'kennzeichen',
  'versicherung_klartext',
  'versicherungsnummer',
])

/**
 * Baut das verursacher-party-Update aus den 'claim_parties'-onboarding_felder einer Phase.
 * - nur db_target.tabelle === 'claim_parties' (defensiv, Caller filtert i.d.R. schon)
 * - nur Spalten in PARTY_ONBOARDING_WRITABLE
 * - leere / nur-Whitespace-Strings -> null (bewusstes Leeren des Felds)
 * - in `values` fehlende oder undefined Werte -> uebersprungen (kein Overwrite)
 */
export function buildVerursacherPartyUpdates(
  felder: OnboardingFeld[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  for (const feld of felder) {
    if (feld.db_target?.tabelle !== 'claim_parties') continue
    const spalte = feld.db_target?.spalte
    if (!spalte || !PARTY_ONBOARDING_WRITABLE.has(spalte)) continue
    if (!(feld.feld_key in values)) continue
    let val = values[feld.feld_key]
    if (val === undefined) continue
    if (typeof val === 'string' && val.trim() === '') val = null
    updates[spalte] = val
  }
  return updates
}
