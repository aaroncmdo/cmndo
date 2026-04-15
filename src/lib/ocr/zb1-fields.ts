/**
 * ZB1 (Zulassungsbescheinigung Teil I) Field Definitions
 *
 * Standard field codes on a German vehicle registration certificate.
 * Used for OCR extraction and validation.
 */

export const ZB1_FIELDS = {
  A: { label: 'Kennzeichen', dbField: 'kennzeichen' },
  B: { label: 'Datum der Erstzulassung', dbField: 'erstzulassung' },
  'C.1': { label: 'Name/Firma des Halters', dbField: 'halter_nachname' },
  'C.3': { label: 'Anschrift des Halters', dbField: 'halter_strasse' },
  'D.1': { label: 'Marke', dbField: 'fahrzeug_hersteller' },
  'D.2': { label: 'Typ/Variante/Version', dbField: 'fahrzeug_modell' },
  'D.3': { label: 'Handelsbezeichnung', dbField: 'fahrzeug_modell' },
  E: { label: 'Fahrzeug-Identifizierungsnummer (FIN)', dbField: 'fin_vin' },
  '2.1': { label: 'HSN (Herstellerschlüsselnummer)', dbField: null },
  '2.2': { label: 'TSN (Typschlüsselnummer)', dbField: null },
} as const

export type ZB1FieldCode = keyof typeof ZB1_FIELDS

/** Validate a FIN/VIN (17 chars, no I/O/Q) */
export function isValidFIN(fin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(fin)
}

/** Validate a German HSN (4 digits) */
export function isValidHSN(hsn: string): boolean {
  return /^\d{4}$/.test(hsn)
}

/** Validate a German TSN (3 alphanumeric) */
export function isValidTSN(tsn: string): boolean {
  return /^[A-Z0-9]{3}$/i.test(tsn)
}

/** Validate a German Kennzeichen (e.g. K-AB 1234, B-CD 567) */
export function isValidKennzeichen(kz: string): boolean {
  return /^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}\s?\d{1,4}[HE]?$/i.test(kz.replace(/\s+/g, ' ').trim())
}
