// AAR-136 / W2: Gegner-Kennzeichen Auto-Flags (Pure Logic).
// Notion-Spec Sektion 2: Aus dem eingegebenen Gegner-KZ werden automatisch
// Fahrerflucht- und Auslandskennzeichen-Flags abgeleitet.

export type KZFlagResult = {
  /** Kein KZ erfasst UND kein Parkplatz — Fahrerflucht-Szenario */
  fahrerflucht: boolean
  /** KZ vorhanden aber nicht im deutschen Format */
  auslandskennzeichen: boolean
  /** Zusatz-UI: Kamera-Check-Frage bei Parkplatz ohne KZ */
  showKameraCheck: boolean
  /** Hinweis-Text für den Dispatcher, sonst null */
  warnung: string | null
}

// Deutsches Kennzeichen-Muster: 1-3 Buchstaben, Bindestrich, 1-2 Buchstaben, 1-4 Ziffern.
// Trennzeichen können Leerzeichen oder Bindestriche sein, das Regex erlaubt beides
// indem wir vorher Whitespace entfernen.
const DEUTSCHES_KZ = /^[A-ZÄÖÜ]{1,3}-[A-ZÄÖÜ]{1,2}\d{1,4}$/i

export function checkKZFlags(
  gegnerKz: string | null | undefined,
  schadentyp: string | null | undefined,
): KZFlagResult {
  const trimmed = gegnerKz?.trim() ?? ''

  if (!trimmed) {
    // Parkplatz ohne KZ → Kamera-Frage anzeigen (Kamera-Aufnahme kann KZ ersetzen)
    if (schadentyp === 'parkplatz') {
      return {
        fahrerflucht: false,
        auslandskennzeichen: false,
        showKameraCheck: true,
        warnung: null,
      }
    }
    // Kein KZ + kein Parkplatz = Fahrerflucht-Szenario
    return {
      fahrerflucht: true,
      auslandskennzeichen: false,
      showKameraCheck: false,
      warnung: 'Kein Gegner-KZ — Fahrerflucht-Flag. Polizei Pflicht!',
    }
  }

  // KZ ist vorhanden — prüfen ob deutsches Format
  const normalized = trimmed.replace(/\s+/g, '')
  const isDeutsch = DEUTSCHES_KZ.test(normalized)

  if (isDeutsch) {
    return {
      fahrerflucht: false,
      auslandskennzeichen: false,
      showKameraCheck: false,
      warnung: null,
    }
  }

  return {
    fahrerflucht: false,
    auslandskennzeichen: true,
    showKameraCheck: false,
    warnung: 'Auslandskennzeichen — längere Regulierung, Zentralruf benötigt.',
  }
}
