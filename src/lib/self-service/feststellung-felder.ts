// AAR-956 P4-A: welche lead-erfassung(kunde)-Felder in ① (Feststellung, pre-SA) gehoeren.
// Deklarative Fakten/Flags; KEINE Uploads, KEINE woanders erfassten, KEINE OCR-Folgedaten.

const EXCLUDE_TYPEN = new Set(['file', 'zb1-upload', 'signature', 'termin', 'slot'])
const EXCLUDE_SEKTIONEN = new Set(['kontakt', 'termin_sv', 'vollmacht', 'status'])
// OCR-Folgedaten (Fahrzeug-ID) — ① lässt sie aus, sie kommen via ZB1-Foto in ②.
// Dieselbe Menge speist den „manuell eingeben statt Foto"-Weg (istDokumentManuellFeld).
const OCR_FOLGEDATEN_FELDER = new Set([
  'fin', 'hsn', 'tsn', 'fahrzeug_hersteller', 'fahrzeug_modell', 'fahrzeug_baujahr', 'fahrzeug_farbe',
])
const EXCLUDE_FELDER = new Set<string>([
  'schuldfrage', // §3a-Quali-Step
  // AAR-956 15.06. (Aaron): „kann der Kunde nicht wissen/haben" -> raus aus der
  // Kunden-Feststellung. Bleibt via Dispatcher-Form (audience=beide) am Claim durch
  // KB/Admin ausfuellbar (kein Datenverlust).
  'nutzungsausfall', // Abrechnungs-Konzept
  'gegner_schadennummer', // kriegt der Kunde erst spaeter von der VS
  'gegner_email', // wird am Unfallort kaum getauscht
  'fahrzeugschaden_beschreibung', // doppelt zu Fotos + Hergang
  'vorschaeden_beschreibung', // Vorschaeden kommen via Cardentity
  ...OCR_FOLGEDATEN_FELDER,
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

// AAR-956 Part 2: Fahrzeug-Dokumentfelder, die der Kunde im FlowLink auch OHNE Foto
// manuell eingeben kann (3. Weg neben Foto-Upload + skip; auch Fallback wenn OCR scheitert).
// Nur einfache Eingabe-Typen (kein Upload/Signatur/Termin).
export function istDokumentManuellFeld(feld: { feld_key: string; typ: string }): boolean {
  return OCR_FOLGEDATEN_FELDER.has(feld.feld_key) && !EXCLUDE_TYPEN.has(feld.typ)
}
