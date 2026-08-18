/** Das Alphabet aus F-01 — URL-sicher, keine Sonderzeichen im Link. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
export const TOKEN_LAENGE = 32

/**
 * Kryptografisch zufaelliger Token (F-01).
 *
 * ⚠ `crypto.getRandomValues`, NIE `Math.random`: Der Token ist der einzige
 * Schutz des Befunds — er wird per Link geteilt, es gibt keine Anmeldung
 * dahinter. Ein vorhersagbarer Token ist ein Zugang zu fremden Befunden.
 *
 * Die Modulo-Verzerrung ist hier vernachlaessigbar (256 mod 64 = 0, das
 * Alphabet teilt 256 glatt) — deshalb genuegt die einfache Abbildung.
 */
export function erzeugeToken(): string {
  const bytes = new Uint8Array(TOKEN_LAENGE)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length]
  return s
}

/**
 * SHA-256 der IP als Hex.
 *
 * F-01 verlangt den Hash statt der Adresse: das Rate-Limit soll zaehlen
 * koennen, ohne dass ein anonymer Check einen Personenbezug bekommt.
 */
export async function hashIp(ip: string): Promise<string> {
  const daten = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', daten)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
