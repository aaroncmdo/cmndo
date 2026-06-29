import { randomBytes as nodeRandomBytes } from 'crypto'

// AAR-auth-haertung: Kryptographisch sicherer Initial-Passwort-Generator.
//
// Ersetzt Math.random()-basierte Generierung (kein CSPRNG -> aus wenigen
// Outputs rekonstruierbar -> vorhersagbare Initialpasswoerter -> Account-
// Takeover). Verwendet randomBytes (CSPRNG) und mappt bias-frei per
// Rejection-Sampling auf ein verwechslungsarmes Alphabet (ohne 0/O/1/I/l).

export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

// Groesstes Vielfaches von ALPHABET.length <= 256. Bytes darueber werden
// verworfen, damit das Modulo keinen Bias auf die niedrigen Indizes erzeugt.
const REJECT_AB = Math.floor(256 / ALPHABET.length) * ALPHABET.length

/**
 * Erzeugt ein kryptographisch sicheres Initial-Passwort. Wird typischerweise
 * mit `force_password_change=true` ausgegeben (User setzt beim ersten Login ein
 * eigenes). `randomBytesFn` ist nur fuer Tests injizierbar.
 */
export function generateInitialPassword(
  laenge = 16,
  randomBytesFn: (n: number) => Buffer = nodeRandomBytes,
): string {
  if (laenge <= 0) throw new Error('laenge muss > 0 sein')
  let pw = ''
  while (pw.length < laenge) {
    // Puffer gegen verworfene Bytes — vermeidet viele Einzelaufrufe.
    const bytes = randomBytesFn(laenge - pw.length + 8)
    for (let i = 0; i < bytes.length && pw.length < laenge; i++) {
      const b = bytes[i]
      if (b < REJECT_AB) pw += ALPHABET[b % ALPHABET.length]
    }
  }
  return pw
}
