// AAR-428 / W1: Kanzlei- + VS-Regulierungs-Actions.
// Re-Export aus `vs-regulierung-actions.ts` + Kanzlei-Handoff aus Monolith.

export {
  vsReguliertVoll,
  vsKuerzt,
  vsLehntAb,
  vsBrauchtMehrZeit,
  vsWillNachbesichtigung,
  ruegeAkzeptiert,
  ruegeAbgelehnt,
  techStellungnahmeFreigeben,
  asVersandManuell,
  zahlungEingegangen,
  schlussabrechnungErstellt,
  klageEingeleitet,
  fallStornieren,
} from '../vs-regulierung-actions'

export {
  uploadAnschlussschreiben,
  setAnschlussschreibenDatum,
  recordZahlung,
  erfasseZahlungseingang,
  saveKanzleiAnsprechpartner,
} from '../actions'

// Prozess-Subactions (waren schon gesplittet in actions/prozess.ts)
export {
  requestTechnischeStellungnahme,
  freigebeTechnischeStellungnahme,
  startRuege,
  uebergebeFallKlage,
} from '../actions/prozess'
