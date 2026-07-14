// AAR-956 15.06.: Geteiltes ZB1-OCR -> leads-Mapping. Vorher war der setIfEmpty-
// Block (OCR-Felder in den Lead schreiben, H6: nur leere Felder) DREIMAL dupliziert
// und gedriftet:
//   - app/flow/[token]/self-service-actions.ts        (uploadZb1Flow)      15 Felder
//   - app/upload/zb1/[token]/actions.ts               (uploadZb1ViaToken)  15 Felder
//   - app/upload/dokumente/[token]/actions.ts         (runZb1OcrAndUpdate) 13 Felder (!)
// Der dokumente-Pfad hat fahrzeug_farbe + brn vergessen. Eine Quelle -> ein neues
// ZB1-Feld braucht jetzt EINE Aenderung statt drei.

import type { ZB1ExtractedData } from './zb1-parser'

/**
 * Baut das `leads`-Update aus dem ZB1-OCR-Ergebnis nach der H6-Konfliktregel:
 * gesetzt werden NUR Felder, die in `current` (aktueller Lead-Stand) leer sind.
 *
 * Liefert ausschliesslich die OCR-abgeleiteten Spalten — zb1_status / zb1_url /
 * zb1_ocr_daten / updated_at etc. mergt der Caller selbst dazu. Den Halter<->Kunde-
 * Name-Match (AAR-666) macht der dokumente-Pfad weiterhin inline (nur dort, kein
 * Duplikat; braucht vorname/nachname im Select).
 */
export function buildZb1LeadUpdate(
  extracted: ZB1ExtractedData,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const update: Record<string, unknown> = {}
  const setIfEmpty = (field: string, value: string | number | null | undefined) => {
    if (value == null) return
    const cur = current[field]
    if (cur == null || cur === '') update[field] = value
  }
  setIfEmpty('fin', extracted.fin_vin)
  setIfEmpty('kennzeichen', extracted.kennzeichen)
  setIfEmpty('fahrzeug_hersteller', extracted.fahrzeug_hersteller)
  setIfEmpty('fahrzeug_modell', extracted.fahrzeug_modell)
  setIfEmpty('fahrzeug_baujahr', extracted.fahrzeug_baujahr)
  setIfEmpty('erstzulassung', extracted.erstzulassung)
  setIfEmpty('halter_vorname', extracted.halter_vorname)
  setIfEmpty('halter_nachname', extracted.halter_nachname)
  setIfEmpty('halter_strasse', extracted.halter_strasse)
  setIfEmpty('halter_plz', extracted.halter_plz)
  setIfEmpty('halter_stadt', extracted.halter_stadt)
  setIfEmpty('hsn', extracted.hsn)
  setIfEmpty('tsn', extracted.tsn)
  setIfEmpty('fahrzeug_farbe', extracted.fahrzeug_farbe)
  setIfEmpty('brn', extracted.brn)
  // Spec B (Aaron 14.07.): EU-/KBA-Fahrzeugklasse aus Feld J — der harte Filter fuers Werkstatt-
  // Matching (eine PKW-Werkstatt repariert keinen LKW). Steht in jedem Schein; wurde nie ausgelesen.
  setIfEmpty('fahrzeugklasse', extracted.fahrzeugklasse)
  return update
}
