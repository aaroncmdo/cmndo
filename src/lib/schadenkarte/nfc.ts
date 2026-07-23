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
  write(
    message: { records: Array<{ recordType: string; data: string }> },
    options?: { overwrite?: boolean; signal?: AbortSignal },
  ): Promise<void>
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

/**
 * Timeout fuers Beschreiben. WICHTIG: NDEFReader.write() wartet OHNE Timeout unendlich auf
 * einen Karten-Tap -- wird keine Karte aufgelegt (oder NFC ist am Geraet aus), haengt der
 * Button ewig. Ein AbortSignal bricht write() nach dieser Zeit mit AbortError ab -> ehrliche
 * "Zeitueberschreitung"-Meldung statt Endlos-Spinner (Prod-Blocker 23.07.).
 */
export const NFC_WRITE_TIMEOUT_MS = 25_000
const NFC_READBACK_TIMEOUT_MS = 10_000

/**
 * Schreibt `url` als URL-NDEF-Record auf einen aufgelegten NFC-Chip (overwrite:false =
 * Clobber-Schutz), liest den Chip zurueck und liefert uid + readBack. Beide Schritte sind
 * zeitbegrenzt (Write via AbortSignal, Read via Timeout) -- kein Endlos-Haengen mehr.
 *
 * Reiner Client-Adapter (nutzt window.NDEFReader); node/SSR-safe durch den window-Guard.
 * Geteilt von NfcKarteBeschreiben (write-first) und NfcKarteSchreibenButton (per-Karte).
 */
export async function writeUndLiesZurueck(
  url: string,
  opts?: { writeTimeoutMs?: number; readTimeoutMs?: number },
): Promise<{ ok: true; uid: string | null; readBack: string | null } | { ok: false; error: string }> {
  if (!nfcVerfuegbar()) {
    return { ok: false, error: 'NFC-Beschreiben geht nur auf einem Android-Gerät mit Chrome.' }
  }
  const Ctor = (window as unknown as { NDEFReader: NdefReaderCtor }).NDEFReader
  try {
    // 1) SCHREIBEN — mit Abort-Timeout (fixt das "unendlich lang"-Haengen).
    const writer = new Ctor()
    const writeCtrl = new AbortController()
    const writeTimer = setTimeout(() => writeCtrl.abort(), opts?.writeTimeoutMs ?? NFC_WRITE_TIMEOUT_MS)
    try {
      await writer.write(
        { records: [{ recordType: NDEF_RECORD_TYPE, data: url }] },
        { overwrite: false, signal: writeCtrl.signal },
      )
    } finally {
      clearTimeout(writeTimer)
    }

    // 2) ZURUECKLESEN — verifiziert spaeter, dass unser Token wirklich auf dem Chip steht.
    const reader = new Ctor()
    const readCtrl = new AbortController()
    const gelesen = await new Promise<{ uid: string | null; readBack: string | null }>((resolve) => {
      const timeout = setTimeout(() => {
        readCtrl.abort()
        resolve({ uid: null, readBack: null })
      }, opts?.readTimeoutMs ?? NFC_READBACK_TIMEOUT_MS)
      reader.onreading = (ev: NdefReadingEventLike) => {
        clearTimeout(timeout)
        const rec = ev.message.records.find((r) => r.recordType === NDEF_RECORD_TYPE)
        const text = rec?.data ? new TextDecoder().decode(rec.data) : null
        readCtrl.abort()
        resolve({ uid: ev.serialNumber ?? null, readBack: text })
      }
      reader.onreadingerror = () => {
        clearTimeout(timeout)
        readCtrl.abort()
        resolve({ uid: null, readBack: null })
      }
      reader.scan({ signal: readCtrl.signal }).catch(() => {
        clearTimeout(timeout)
        readCtrl.abort()
        resolve({ uid: null, readBack: null })
      })
    })
    return { ok: true, uid: gelesen.uid, readBack: gelesen.readBack }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        error: 'Zeitüberschreitung — es wurde keine Karte aufgelegt. Bitte eine leere Karte auflegen und erneut versuchen.',
      }
    }
    // overwrite:false auf einer NICHT leeren Karte UND eine abgelehnte Berechtigung landen beide
    // als NotAllowedError -> nicht sicher unterscheidbar. Ehrliche kombinierte Meldung.
    const denied = err instanceof Error && err.name === 'NotAllowedError'
    return {
      ok: false,
      error: denied
        ? 'Beschreiben nicht möglich — entweder ist die Karte nicht leer oder der NFC-Zugriff wurde abgelehnt. Bitte eine leere Karte auflegen und den Zugriff erlauben.'
        : 'Beschreiben fehlgeschlagen. Bitte eine leere Karte erneut auflegen.',
    }
  }
}
