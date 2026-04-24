// AAR-289: Code-basierte Sichtbarkeits-Map für Dokumente nach Rolle.
// Quelle: Miro Daten-Matrix
// (https://miro.com/app/board/uXjVGqRvwSs=/?moveToWidget=3458764665698251425)
//
// Zweite Filter-Ebene auf top von dokumente.sichtbar_fuer (DB-Array). Der
// spätere Dokumenten-Refactor wird diese Map in die DB spiegeln — heute
// reicht Code.
//
// KRITISCH: Dokument-Typen die hier NICHT eingetragen sind, fallen zurück
// auf „nur admin" (fail-safe). Vor Produktion neue Typen eintragen.

export type Rolle =
  | 'admin'
  | 'dispatch'
  | 'kundenbetreuer'
  | 'sachverstaendiger'
  | 'kunde'
  | 'kanzlei'

/**
 * Welche Rolle darf welchen Dokument-Typ sehen?
 * Key: `dokumente.typ` oder `fall_dokumente.dokument_typ` oder
 *      `pflichtdokumente.dokument_typ`
 */
export const DOKUMENT_SICHTBAR_FUER: Record<string, Rolle[]> = {
  // Kunden-Uploads (Basis der Fallbearbeitung — alle sehen sie)
  fahrzeugschein: ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  schadensfotos: ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  polizeibericht: ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  polizeiliche_unfallmitteilung: ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  gewerbenachweis: ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  mietwagenrechnung: ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  // AAR-353: Vorschaden-Dokumente (CarDentity-Trigger) + Kaufvertrag als Beleg
  reparaturrechnung_vorschaden: ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
  kaufvertrag: ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
  // AAR-353: Freigabe der Bank bei Leasing/Finanzierung (kein SV/Kanzlei)
  freigabe_bank: ['admin', 'dispatch', 'kundenbetreuer', 'kunde'],

  // WhatsApp-Foto/Datei generisch (AAR-158-Webhook-Pfad)
  'whatsapp-foto': ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  'whatsapp-datei': ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],

  // Vollmachten / Verträge → SV sieht NICHT (Mandats-interne Dokumente)
  sa_vollmacht: ['admin', 'dispatch', 'kundenbetreuer', 'kunde', 'kanzlei'],
  kanzlei_vollmacht: ['admin', 'dispatch', 'kundenbetreuer', 'kunde', 'kanzlei'],
  mandatsvertrag: ['admin', 'dispatch', 'kundenbetreuer', 'kunde', 'kanzlei'],
  sicherungsabtretung: ['admin', 'dispatch', 'kundenbetreuer', 'kunde', 'kanzlei'],
  halter_vollmacht: ['admin', 'dispatch', 'kundenbetreuer', 'kunde', 'kanzlei'],
  halter_ausweis: ['admin', 'dispatch', 'kundenbetreuer', 'kunde', 'kanzlei'],
  gf_vollmacht: ['admin', 'dispatch', 'kundenbetreuer', 'kunde', 'kanzlei'],

  // Personenschaden — Kunde + KB + Kanzlei
  aerztliches_attest: ['admin', 'kundenbetreuer', 'kunde', 'kanzlei'],
  krankenhausbericht: ['admin', 'kundenbetreuer', 'kunde', 'kanzlei'],
  au_bescheinigung: ['admin', 'kundenbetreuer', 'kunde', 'kanzlei'],

  // Vorschäden-interne Dokumente — Kunde NICHT (Recherche-Artefakte)
  vorschaden_bericht: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei'],
  cardentity_report: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei'],

  // Gutachten-Prozess
  gutachten: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'], // Dispatcher NICHT
  gutachter_fotos: ['admin', 'kundenbetreuer', 'sachverstaendiger'],                 // Vor-Ort-Fotos des SV
  technische_stellungnahme: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei'],
  nachbesichtigung_bericht: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei'],
  // OCR-Snapshots
  'ocr-fahrzeugschein': ['admin', 'kundenbetreuer', 'sachverstaendiger'],

  // Kanzlei-Prozess (Webhook-Dokumente). AAR-353: anspruchsschreiben ist kein
  // Katalog-Slot mehr, kommt aber weiterhin als dokumente.typ via Kanzlei-Webhook.
  anspruchsschreiben: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  regulierungsbescheid: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  // AAR-263: Polizeibericht-Foto via WA
  polizeiliche_unfallmitteilung_foto: ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],

  // Intern — SV + Kunde sehen NICHT
  ki_kalkulation: ['admin', 'kundenbetreuer', 'kanzlei'],
  ki_schadenkalkulation: ['admin', 'kundenbetreuer', 'kanzlei'],
  kanzlei_paket: ['admin', 'kundenbetreuer', 'kanzlei'],
  filmcheck_notizen: ['admin', 'kundenbetreuer'],
  abrechnung_intern: ['admin', 'kundenbetreuer'],

  // Rechnungen
  rechnung_gutachten: ['admin', 'kundenbetreuer', 'sachverstaendiger'],
  rechnung_kanzlei: ['admin', 'kundenbetreuer', 'kanzlei'],

  // Sonstige Kategorien (aus Webhook-Logik)
  kundendokument: ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  zulassung: ['admin', 'dispatch', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
}

type WithTypKategorie = {
  typ?: string | null
  kategorie?: string | null
  dokument_typ?: string | null
  // AAR-263 + AAR-158: Manche Inserts setzen sichtbar_fuer direkt am Doc.
  // Wenn vorhanden, ist es die Quelle der Wahrheit (überschreibt die Map).
  sichtbar_fuer?: string[] | null
}

/**
 * Filtert eine Liste Dokumente auf die für eine Rolle sichtbaren.
 * Logik:
 * 1. Wenn `dokumente.sichtbar_fuer` (DB-Array) gesetzt ist → das gilt
 *    (Belt-and-suspenders mit der Code-Map).
 * 2. Sonst: DOKUMENT_SICHTBAR_FUER nach typ / dokument_typ / kategorie
 * 3. Fallback: nur Admin (fail-safe für unbekannte Typen)
 */
export function getSichtbarFuerRolle<T extends WithTypKategorie>(
  dokumente: T[],
  rolle: Rolle,
): T[] {
  return dokumente.filter((d) => {
    if (Array.isArray(d.sichtbar_fuer) && d.sichtbar_fuer.length > 0) {
      return d.sichtbar_fuer.includes(rolle)
    }
    const key = d.dokument_typ ?? d.typ ?? d.kategorie ?? ''
    const erlaubt = DOKUMENT_SICHTBAR_FUER[key]
    if (!erlaubt) return rolle === 'admin'
    return erlaubt.includes(rolle)
  })
}

/** Helper: Darf Rolle X Dokument-Typ Y sehen? */
export function darfSehen(typ: string, rolle: Rolle): boolean {
  const erlaubt = DOKUMENT_SICHTBAR_FUER[typ]
  if (!erlaubt) return rolle === 'admin'
  return erlaubt.includes(rolle)
}
