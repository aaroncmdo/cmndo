// Schadenkarte-Token: Generierung + Extraktion aus gescannten URLs.
// Token = 'SKT-' + 16 Zeichen aus einem verwechslungsarmen Alphabet
// (kein 0/1/I/L/O/U). Spiegelt src/lib/werkstatt/qr-pool-token.ts.
// DB-UNIQUE + Retry sichert Eindeutigkeit.

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const TOKEN_LEN = 16

/** Erzeugt einen lesbaren Schadenkarte-Token (SKT-XXXXXXXXXXXXXXXX), crypto-random. */
export function generateSchadenkarteToken(): string {
  const bytes = new Uint8Array(TOKEN_LEN)
  crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < TOKEN_LEN; i++) code += ALPHABET[bytes[i] % ALPHABET.length]
  return `SKT-${code}`
}

/**
 * Extrahiert den Schadenkarte-Token aus einer gescannten Eingabe.
 * - URL-Form: `.../schaden/<token>` -> `<token>`.
 * - Bare Token: `SKT-...` -> normalisiert (uppercase).
 * Gibt `null` zurueck, wenn nichts Passendes gefunden wird.
 *
 * Alphabet (verwechslungsarm, kein I/L/O/U): 2-9 A-H J K M N P-T V-Z
 */
export function extractSchadenkarteToken(scanned: string): string | null {
  const trimmed = (scanned ?? '').trim().toUpperCase()
  if (!trimmed) return null
  // URL-Form: /schaden/<token>
  const urlMatch = trimmed.match(/\/SCHADEN\/(SKT-[0-9A-HJKMNP-TV-Z]{16})\b/i)
  if (urlMatch) return urlMatch[1]
  // Bare token (already uppercased)
  if (/^SKT-[0-9A-HJKMNP-TV-Z]{16}$/i.test(trimmed)) return trimmed
  return null
}
