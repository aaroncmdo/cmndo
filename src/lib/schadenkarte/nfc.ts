// Web NFC (NDEFReader) fuer das Beschreiben der physischen Schadenkarte.
//
// Plattform-Realitaet (wichtig, damit die UI ehrlich ist):
//   SCHREIBEN : nur Chrome/Android. Apple gibt Web NFC nicht frei -> iPhone kann NICHT schreiben.
//   ANTIPPEN  : iPhone UND Android. iOS liest NDEF-URI-Tags nativ ueber das OS (ohne App).
// Nur der Setup-Schritt braucht also Android; der Ernstfall funktioniert ueberall.
//
// NDEFReader ist nicht in den Standard-DOM-Types -- gleiches Muster wie BarcodeDetector
// in components/flotte/SchadenkarteScanner.tsx.
import { extractSchadenkarteToken } from './token'

export interface NdefReadingEventLike {
  serialNumber: string
  message: { records: ReadonlyArray<{ recordType: string; data?: DataView }> }
}

export interface NdefReaderLike {
  write(message: { records: Array<{ recordType: string; data: string }> }): Promise<void>
  scan(options?: { signal?: AbortSignal }): Promise<void>
  onreading: ((event: NdefReadingEventLike) => void) | null
  onreadingerror: ((event: Event) => void) | null
}

export type NdefReaderCtor = new () => NdefReaderLike

/**
 * NDEF-Record-Typ. MUSS 'url' sein: iPhones oeffnen beim Auflegen nur Well-Known-URI-Tags
 * automatisch ueber das OS. Ein Custom-MIME-Record wuerde auf iOS gar nicht aufpoppen --
 * die Karte waere fuer die Haelfte der Unfallgegner tot.
 */
export const NDEF_RECORD_TYPE = 'url' as const

/** Kann dieses Geraet NFC-Tags beschreiben? (Chrome/Android ja, iPhone/Desktop nein.) */
export function nfcVerfuegbar(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window
}

/**
 * Traegt der zurueckgelesene Chip wirklich den erwarteten Token?
 *
 * Das ist die Kern-Sicherung des Beschreib-Vorgangs. Wuerde der Chip einen anderen Token
 * tragen als der aufgeklebte QR, haette die physische Karte ZWEI Identitaeten
 * (Auflegen -> Fahrzeug A, Scannen -> Fahrzeug B). Deshalb wird nach dem Schreiben
 * zurueckgelesen und hier verglichen; schlaegt das fehl, gilt die Karte als NICHT beschrieben.
 *
 * extractSchadenkarteToken parst sowohl die volle /schaden/<token>-URL als auch einen
 * nackten Token -> beide Chip-Varianten werden akzeptiert.
 */
export function chipTraegtToken(gelesen: string | null, erwartet: string): boolean {
  if (!gelesen) return false
  return extractSchadenkarteToken(gelesen) === erwartet
}
