// Filmcheck QC-Anomalie-Erkennung (02.07., Aaron-DEFAULT-Regelset).
//
// Reine Logik (server-import-frei). Prueft die flachen OCR-Werte am gutachten auf
// Widersprueche/Unplausibilitaeten, damit der KB beim Filmcheck WARNUNGEN sieht statt
// blind abzuhaken. Schwesterdatei zu auto-checks.ts (dort werden Checks vorbefuellt;
// hier werden Widersprueche geflaggt).
//
// PRINZIP (wie auto-checks.ts): Eine Regel feuert NUR, wenn ihre Inputs non-null sind.
// Nie auf fehlenden Daten warnen — ein Fehlalarm auf "Feld noch nicht ausgefuellt"
// waere schlimmer als keine Warnung. Nutzersichtbare Texte -> echte Umlaute.

/** Flache OCR-Kern-Werte des Gutachtens, ueber die die Anomalie-Regeln laufen. */
export type GutachtenAnomalieInput = {
  reparaturkosten_netto: number | null
  wiederbeschaffungswert: number | null
  restwert: number | null
  minderwert: number | null
  totalschaden: boolean | null
  /** gutachten.gutachten_fin (Fahrzeug-Identifizierungsnummer). */
  gutachten_fin: string | null
}

export type GutachtenAnomalie = {
  /** Stabiler Code (Test-/Log-Anker). */
  code: string
  /** Nutzersichtbarer Text (Deutsch, echte Umlaute). */
  text: string
  /** warnung = wahrscheinlicher Fehler; hinweis = pruefen, evtl. legitim. */
  schwere: 'warnung' | 'hinweis'
}

/**
 * Findet Widersprueche in den flachen Gutachten-OCR-Werten. Gibt [] zurueck, wenn
 * nichts auffaellt. Reihenfolge = fachliche Prioritaet (Totalschaden-Signal zuerst).
 */
export function berechneGutachtenAnomalien(w: GutachtenAnomalieInput): GutachtenAnomalie[] {
  const anomalien: GutachtenAnomalie[] = []
  const { reparaturkosten_netto, wiederbeschaffungswert, restwert, minderwert, totalschaden, gutachten_fin } = w

  // Regel 1 (warnung): Reparaturkosten uebersteigen den WBW, aber NICHT als
  // Totalschaden markiert -> wahrscheinlich wirtschaftlicher Totalschaden uebersehen.
  // Nur wenn beide Betraege vorliegen. totalschaden !== true deckt false UND null ab.
  if (
    reparaturkosten_netto != null &&
    wiederbeschaffungswert != null &&
    reparaturkosten_netto > wiederbeschaffungswert &&
    totalschaden !== true
  ) {
    anomalien.push({
      code: 'reparatur_ueber_wbw',
      text: 'Reparaturkosten übersteigen den Wiederbeschaffungswert — wirtschaftlicher Totalschaden? Nicht als Totalschaden markiert.',
      schwere: 'warnung',
    })
  }

  // Regel 2 (warnung): FIN vorhanden aber getrimmt nicht 17 Zeichen. Nur bei
  // nicht-leerem Wert (leer/whitespace = kein FIN erfasst -> KB-Urteil, kein Alarm).
  if (gutachten_fin != null) {
    const fin = gutachten_fin.trim()
    if (fin.length > 0 && fin.length !== 17) {
      anomalien.push({
        code: 'fin_nicht_17',
        text: 'FIN hat nicht 17 Zeichen.',
        schwere: 'warnung',
      })
    }
  }

  // Regel 3 (warnung): Restwert groesser als WBW -> unplausibel (Restwert ist immer
  // ein Bruchteil des Wiederbeschaffungswerts).
  if (restwert != null && wiederbeschaffungswert != null && restwert > wiederbeschaffungswert) {
    anomalien.push({
      code: 'restwert_ueber_wbw',
      text: 'Restwert größer als Wiederbeschaffungswert — unplausibel.',
      schwere: 'warnung',
    })
  }

  // Regel 4 (hinweis): Minderwert groesser als WBW -> unplausibel, aber seltener ein
  // harter Fehler (daher nur Hinweis).
  if (minderwert != null && wiederbeschaffungswert != null && minderwert > wiederbeschaffungswert) {
    anomalien.push({
      code: 'minderwert_ueber_wbw',
      text: 'Minderwert größer als Wiederbeschaffungswert — unplausibel.',
      schwere: 'hinweis',
    })
  }

  // Regel 5 (hinweis): Totalschaden markiert, aber kein Restwert -> fuer die Abrechnung
  // wird der Restwert benoetigt. Nur wenn totalschaden explizit true UND restwert fehlt.
  if (totalschaden === true && restwert == null) {
    anomalien.push({
      code: 'totalschaden_ohne_restwert',
      text: 'Totalschaden ohne Restwert — für die Abrechnung erforderlich.',
      schwere: 'hinweis',
    })
  }

  return anomalien
}
