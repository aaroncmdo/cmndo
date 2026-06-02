// P3b (dispatch-config-unify): Ableitungs-Logik fuer den config-getriebenen
// v2-Autosave (saveDispatchLeadFelder). Der generische Autosave schreibt nur die
// rohen, vom Dispatcher gesetzten Spalten — diese Funktion ergaenzt die abgeleiteten
// Spalten, die frueher die Legacy-Actions setzten und die der Cutover sonst still
// verlieren wuerde:
//
//   - polizeibericht_pflicht  (aus polizei_vor_ort)  — frueher saveHardGate.
//       Steuert den Polizeibericht-Anforder-Button (DokumenteAnfordernCard) + die
//       Dokument-Erwartung (lib/dokumente/erwartung.ts) + convertLeadToClaim.
//   - unfallort_kategorie     (aus schadentyp)       — frueher saveSchadentyp.
//       Fliesst via convertLeadToClaim nach claims.schadenort_kategorie.
//
// BEWUSST NICHT repliziert: die Auto-Disqualifikation (eigenverschulden/kein_schaden/
// kein_haftpflicht/parkplatz-ohne-kamera). Im v2 entscheidet der Dispatcher manuell
// ueber das `disqualifiziert`-Flag + Warn-Badges (DispatchGatesPanel, P2c-Design).

// AAR-215: muss EXAKT dem CHECK-Constraint von leads.unfallort_kategorie entsprechen
// (parkluecke | kreuzung | autobahn | landstrasse | innerorts | sonstiges). spurwechsel
// + auffahrunfall haben keinen eindeutigen Ort -> null (Dispatcher pflegt manuell).
const KATEGORIE_AUTO: Record<string, string | null> = {
  spurwechsel: null,
  auffahrunfall: null,
  vorfahrtsverletzung: 'kreuzung',
  parkplatz: 'parkluecke',
  sonstiges: null,
}

/**
 * Leitet abhaengige leads-Spalten aus den im Autosave-Payload geaenderten Roh-Feldern
 * ab. `update` ist das bereits coercte, spalten-benannte Update-Objekt (Keys = DB-Spalten);
 * `currentUnfallortKategorie` ist der aktuelle DB-Wert (damit eine manuell/Kunde gepflegte
 * Kategorie nicht ueberschrieben wird). Liefert die zu mergenden Zusatzfelder (leer = nichts).
 */
export function deriveDispatchLeadFelder(
  update: Record<string, unknown>,
  currentUnfallortKategorie: string | null,
): Record<string, unknown> {
  const derived: Record<string, unknown> = {}

  // Polizei vor Ort => Bericht-Pflicht (Legacy-saveHardGate-Default). polizei_vor_ort
  // ist im v2-Form editierbar, polizeibericht_pflicht nicht -> hier ableiten.
  if ('polizei_vor_ort' in update) {
    derived.polizeibericht_pflicht = update.polizei_vor_ort === true
  }

  // Schadentyp => Ortskategorie, aber nur wenn noch leer (manuelle/Kunde-Pflege wahren).
  if ('schadentyp' in update && !currentUnfallortKategorie) {
    const auto = KATEGORIE_AUTO[String(update.schadentyp)]
    if (auto) derived.unfallort_kategorie = auto
  }

  return derived
}
