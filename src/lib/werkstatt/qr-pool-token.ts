// Werkstatt-QR-Pool: Token-Generierung + Extraktion aus gescannten URLs.
// Token = 'WQR-' + 8 Zeichen aus einem verwechslungsarmen Alphabet
// (kein 0/1/I/L/O/U). Rein + testbar; DB-UNIQUE + Retry sichert Eindeutigkeit.

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const TOKEN_LEN = 8

/** Erzeugt einen lesbaren Pool-Token (WQR-XXXXXXXX), crypto-random. */
export function generateQrPoolToken(): string {
  const bytes = new Uint8Array(TOKEN_LEN)
  crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < TOKEN_LEN; i++) code += ALPHABET[bytes[i] % ALPHABET.length]
  return `WQR-${code}`
}

/**
 * Extrahiert den Pool-Token aus einer gescannten Eingabe.
 * - URL-Form: `.../start/werkstatt-qr/<token>` → `<token>`.
 * - Bare Token: `WQR-...` → normalisiert (uppercase).
 * Gibt `null` zurueck, wenn nichts Passendes gefunden wird.
 */
export function extractQrPoolToken(scanned: string): string | null {
  const trimmed = (scanned ?? '').trim()
  if (!trimmed) return null
  const urlMatch = trimmed.match(/\/start\/werkstatt-qr\/(WQR-[0-9A-Za-z]+)/i)
  if (urlMatch) return urlMatch[1].toUpperCase()
  if (/^WQR-[0-9A-Za-z]+$/i.test(trimmed)) return trimmed.toUpperCase()
  return null
}
