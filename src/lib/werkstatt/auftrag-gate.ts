// Spec E Phase 1a (#4497): das Reparatur-Termin-Gate. Reine, testbare Ableitung — steuert, ob ein
// vermittelter Werkstatt-Auftrag terminiert/gebucht/abgeschlossen werden darf.
//
// GATE OFFEN ⟺
//   modus = 'direkt'                                  (Bagatell/Express/VS-Direkt/Kunde-Wahl "ohne KVA")
//   ∨ kva_quelle ∈ ('kunde','zubringer')              (Preis kunde-seitig eingebracht → kein Kostenrisiko)
//   ∨ (kva_quelle = 'werkstatt' ∧ freigegeben)        (Werkstatt-KVA vom Kunden freigegeben)
//
// Sonst ZU: kva_erst ohne KVA (Werkstatt muss liefern) bzw. Werkstatt-KVA ohne Kundenfreigabe
// (bzw. abgelehnt → neuer KVA nötig). Ein Werkstatt-Gegen-KVA auf einen Kunden-KVA setzt die
// Quelle auf 'werkstatt' + nullt freigegeben → das Gate faellt automatisch wieder zu.

export type AuftragGateInput = {
  /** claims.reparatur_auftrag_modus — 'kva_erst' | 'direkt' (NULL defensiv wie kva_erst). */
  reparatur_auftrag_modus: string | null
  /** claims.kva_quelle — 'kunde' | 'werkstatt' | 'zubringer' | null. */
  kva_quelle: string | null
  /** claims.reparatur_freigegeben_am — Kundenfreigabe des KVA (timestamptz). */
  reparatur_freigegeben_am: string | null
  /** claims.kva_abgelehnt_am — Kunde hat den (Werkstatt-)KVA abgelehnt. */
  kva_abgelehnt_am?: string | null
}

/** Grund, warum das Gate ZU ist (für Werkstatt-Erklärtext + Kunde-Stepper-Label). null = offen. */
export type GateGrund = 'kva_ausstehend' | 'wartet_freigabe' | 'abgelehnt' | null

export type ReparaturGateStatus = { offen: boolean; grund: GateGrund }

/**
 * Vollständiger Gate-Status inkl. Grund. Reine Funktion — Konsumenten: Server-Gates in den
 * Termin-Actions, Werkstatt-Auftrags-Detail (Führung), Kunde-Stepper-Label.
 */
export function reparaturGate(claim: AuftragGateInput): ReparaturGateStatus {
  if (claim.reparatur_auftrag_modus === 'direkt') return { offen: true, grund: null }

  const q = claim.kva_quelle
  if (q === 'kunde' || q === 'zubringer') return { offen: true, grund: null }

  if (q === 'werkstatt') {
    if (claim.reparatur_freigegeben_am != null) return { offen: true, grund: null }
    if (claim.kva_abgelehnt_am != null) return { offen: false, grund: 'abgelehnt' }
    return { offen: false, grund: 'wartet_freigabe' }
  }

  // kva_erst (oder NULL/unbekannt) ohne jede Quelle → noch kein Kostenvoranschlag.
  return { offen: false, grund: 'kva_ausstehend' }
}

/** Kurzform: darf terminiert/gebucht/abgeschlossen werden? */
export function istReparaturGateOffen(claim: AuftragGateInput): boolean {
  return reparaturGate(claim).offen
}

/** Nutzer-sichtbarer Erklärtext (Deutsch, Umlaute) je Grund — für Werkstatt-Auftrag + Kunde-Stepper. */
export function gateGrundLabel(grund: GateGrund): string | null {
  switch (grund) {
    case 'kva_ausstehend':
      return 'Kostenvoranschlag ausstehend'
    case 'wartet_freigabe':
      return 'Wartet auf Freigabe des Kunden'
    case 'abgelehnt':
      return 'Kostenvoranschlag abgelehnt — bitte neuen einreichen'
    case null:
      return null
  }
}
