// AAR-761: Pro Beleg-Typ ein typ-spezifischer Prompt. Claude-Vision liest
// die Rechnung und gibt ein JSON zurück das dem BelegExtraktion-Type
// entspricht. Felder die nicht erkennbar sind: null (NICHT raten).

import type { BelegTyp } from './types'

const GEMEINSAM = `
Erkenne diese gemeinsamen Felder:
- rechnungsdatum (ISO, YYYY-MM-DD)
- rechnungsnummer
- rechnungsbetrag_brutto (Zahl in Euro, ohne Währungssymbol)
- rechnungsbetrag_netto (Zahl in Euro)
- ust_prozent (Zahl, typisch 19)
- aussteller_firma (Name des Rechnungsstellers)
- aussteller_iban (IBAN wenn vorhanden)

Wenn ein Feld nicht eindeutig erkennbar ist: null zurückgeben.
Niemals raten. Zahlen als Dezimal-Zahlen (z.B. 149.50 — Punkt als Dezimal-
trennzeichen).
`.trim()

export function buildPromptForTyp(typ: BelegTyp): string {
  const typSpezifisch: Record<BelegTyp, string> = {
    mietwagen_rechnung: `
Du bekommst eine Rechnung von einem Mietwagen-Vermieter.
Zusätzlich zu den Standard-Feldern erkenne:
- abhol_datum (ISO)
- rueckgabe_datum (ISO, oder null wenn nicht abgegeben)
- tage_anzahl (berechnet aus Abhol/Rueckgabe falls beide vorhanden)
- fahrzeug_hinweis (Modell/Klasse des Mietwagens)
`.trim(),
    werkstatt_rechnung: `
Du bekommst eine Werkstatt-Rechnung.
Zusätzlich erkenne:
- fahrzeug_kennzeichen
- positionen: Array von { beschreibung, betrag_brutto } je Position.
  Max 20 Positionen; bei unstrukturierten Rechnungen leer lassen.
`.trim(),
    abschlepp_rechnung: `
Du bekommst eine Abschlepp-Rechnung.
Zusätzlich erkenne:
- abhol_ort (Straße/Stadt wo das Fahrzeug abgeholt wurde)
- abstellort (wo das Fahrzeug hingebracht wurde)
- tarif_hinweis (z.B. "Bergung nachts", "Autobahn")
`.trim(),
    attest: `
Du bekommst ein ärztliches Attest.
Zusätzlich erkenne:
- ausgestellt_fuer (Name der behandelten Person wenn erkennbar — DSGVO-
  sensitive, aber für Zuordnung nötig)
`.trim(),
    sonstiges: `
Beleg ohne spezifischen Typ. Nur Standard-Felder extrahieren.
`.trim(),
  }

  return `
${GEMEINSAM}

${typSpezifisch[typ]}

Antwort-Format: Nur JSON-Objekt, keine Kommentare, keine Markdown-Codeblöcke.
Format: { "typ": "${typ}", ...fields }
`.trim()
}
