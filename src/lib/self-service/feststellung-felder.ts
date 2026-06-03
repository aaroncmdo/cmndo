// AAR-956 P4-A: welche lead-erfassung(kunde)-Felder in ① (Feststellung, pre-SA) gehoeren.
// Deklarative Fakten/Flags; KEINE Uploads, KEINE woanders erfassten, KEINE OCR-Folgedaten.

const EXCLUDE_TYPEN = new Set(['file', 'zb1-upload', 'signature', 'termin', 'slot'])
const EXCLUDE_SEKTIONEN = new Set(['kontakt', 'termin_sv', 'vollmacht', 'status'])
const EXCLUDE_FELDER = new Set([
  'schuldfrage', // §3a-Quali-Step
  // OCR-Folgedaten — kommen via ZB1-Foto in ②
  'fin', 'hsn', 'tsn', 'fahrzeug_hersteller', 'fahrzeug_modell', 'fahrzeug_baujahr', 'fahrzeug_farbe',
])

export function istFeststellungsFeld(feld: {
  feld_key: string
  typ: string
  sektion?: string | null
}): boolean {
  if (EXCLUDE_TYPEN.has(feld.typ)) return false
  if (feld.sektion && EXCLUDE_SEKTIONEN.has(feld.sektion)) return false
  if (EXCLUDE_FELDER.has(feld.feld_key)) return false
  return true
}
