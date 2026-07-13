// #8 Vermittler-SSoT Phase 2 — wer hat uns den Claim gebracht (INBOUND)?
//
// Genau EIN Vermittler pro Claim => genau EINE Provision. `claims.vermittler_typ` /
// `claims.vermittler_id` sind die SSoT (Mig 20260713195613); die drei Provisions-Trigger
// (create_makler_provision / create_werkstatt_provision / create_firmen_flotte_provision)
// gaten transition-safe darauf: ist vermittler_typ NULL, fallen sie auf das Roh-Signal
// zurueck (makler_id / werkstatt_id) — sonst feuert nur der genannte Typ.
//
// Praezedenz (identisch zum Phase-1-Backfill): makler > werkstatt-inbound > firmen_flotte.
//
// INBOUND = wer den Claim vermittelt hat. NIE outbound: `reparatur_werkstatt_id` (wohin WIR
// steuern) und `sv_id` (den WIR zuweisen) sind keine Vermittler und bekommen keine Provision.

export type VermittlerTyp = 'makler' | 'werkstatt' | 'firmen_flotte'

export interface VermittlerSignale {
  /** claims.makler_id — aufgeloest aus promotion_codes.makler_id (Makler-Vermittlung). */
  maklerId: string | null
  /** claims.werkstatt_id — VERMITTELNDE Werkstatt (QR/Inbound), NICHT reparatur_werkstatt_id. */
  werkstattId: string | null
  /** firmen_flotten_konten.id — aktives Flotten-Konto zum Claim-Fahrzeug. */
  flotteKontoId: string | null
}

export interface VermittlerResult {
  vermittlerTyp: VermittlerTyp | null
  vermittlerId: string | null
}

export function deriveVermittler(signale: VermittlerSignale): VermittlerResult {
  if (signale.maklerId) {
    return { vermittlerTyp: 'makler', vermittlerId: signale.maklerId }
  }
  if (signale.werkstattId) {
    return { vermittlerTyp: 'werkstatt', vermittlerId: signale.werkstattId }
  }
  if (signale.flotteKontoId) {
    return { vermittlerTyp: 'firmen_flotte', vermittlerId: signale.flotteKontoId }
  }
  return { vermittlerTyp: null, vermittlerId: null }
}
