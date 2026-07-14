// AAR-411: Kennzeichen-Formatierung. Die ursprüngliche Implementierung
// lebte in src/lib/dispatch/fahrzeug-marken.ts und wurde hier zentralisiert.
// fahrzeug-marken.ts re-exportiert `formatKennzeichen` zur Rückwärts-
// kompatibilität.

/**
 * Formatiert ein Kennzeichen auf die Standard-Form "K-AB 1234".
 * Akzeptiert "KAB1234", "K AB 1234", "k-ab-1234" usw.
 */
export function formatKennzeichen(raw: string | null | undefined): string {
  if (!raw) return ''
  const cleaned = raw.toUpperCase().replace(/[^A-ZÄÖÜ0-9\s-]/g, '').trim()
  const compact = cleaned.replace(/[\s-]+/g, '')
  // Non-greedy auf den Stadt-Block, damit "KAB1234" als K-AB 1234 gelesen
  // wird (nicht als KA-B) und "MEIAB123" als MEI-AB 123 (Backtracking).
  const m = compact.match(/^([A-ZÄÖÜ]{1,3}?)([A-ZÄÖÜ]{1,2})(\d{1,4})$/)
  if (m) return `${m[1]}-${m[2]} ${m[3]}`
  return cleaned
}

/**
 * Zerlegt ein formatiertes Kennzeichen in seine Bestandteile.
 * "K-AS 1234E" → { kreis: "K", buchstaben: "AS", zahl: "1234", suffix: "E" }
 */
export function parseKennzeichen(raw: string | null | undefined): {
  kreis: string
  buchstaben: string
  zahl: string
  suffix: 'E' | 'H' | null
} | null {
  if (!raw) return null
  const trimmed = raw.replace(/\s+/g, ' ').trim().toUpperCase()
  const m = /^([A-ZÄÖÜ]{1,3})[\s-]*([A-Z]{1,2})[\s-]*(\d{1,4})\s*([EH])?$/.exec(trimmed)
  if (!m) return { kreis: trimmed, buchstaben: '', zahl: '', suffix: null }
  return {
    kreis: m[1],
    buchstaben: m[2],
    zahl: m[3],
    suffix: (m[4] === 'E' || m[4] === 'H') ? m[4] : null,
  }
}

/**
 * Baut aus den Einzelteilen das kombinierte Kennzeichen-String.
 * { kreis: "K", buchstaben: "AS", zahl: "1234", suffix: "E" } → "K-AS 1234E"
 */
export function buildKennzeichen(
  kreis: string,
  buchstaben: string,
  zahl: string,
  suffix?: string | null,
): string {
  if (!kreis && !buchstaben && !zahl) return ''
  const base = `${kreis.toUpperCase()}${buchstaben ? `-${buchstaben.toUpperCase()}` : ''} ${zahl}`
  return suffix ? `${base.trim()}${suffix.toUpperCase()}` : base.trim()
}

/**
 * Die fünf leads-Spalten, die ein Kennzeichen-Parts-Editor schreibt:
 * der kombinierte String + die vier Einzelteile.
 */
export type KennzeichenFields = {
  kennzeichen: string | null
  kennzeichen_kreis: string | null
  kennzeichen_buchstaben: string | null
  kennzeichen_zahl: string | null
  kennzeichen_suffix: 'E' | 'H' | null
}

/**
 * Baut aus den Parts-Eingaben das vollständige Spalten-Update (kombiniert +
 * Einzelteile). Leere Teile werden zu NULL; das Suffix wird auf E/H normalisiert
 * (ungültige Werte → null und fließen nicht in den kombinierten String ein).
 * Einzige Quelle der Parts→Spalten-Abbildung (Phase-4-Inline-Edit + Dispatcher-
 * v2-Override teilen sie sich, AAR P2d-2b).
 */
export function buildKennzeichenFields(
  kreis: string,
  buchstaben: string,
  zahl: string,
  suffix?: string | null,
): KennzeichenFields {
  const normSuffix: 'E' | 'H' | null = suffix === 'E' || suffix === 'H' ? suffix : null
  const combined = buildKennzeichen(kreis, buchstaben, zahl, normSuffix)
  return {
    kennzeichen: combined || null,
    kennzeichen_kreis: kreis.toUpperCase() || null,
    kennzeichen_buchstaben: buchstaben.toUpperCase() || null,
    kennzeichen_zahl: zahl || null,
    kennzeichen_suffix: normSuffix,
  }
}

/**
 * Maskiert ein Kennzeichen für Datenschutz-Anzeigen:
 *   "K-JB 2025" → "K-XX 25"
 * Unvollständige Kennzeichen werden so gut wie möglich maskiert.
 */
export function maskKennzeichen(raw: string | null | undefined): string {
  const formatted = formatKennzeichen(raw)
  if (!formatted) return ''
  const m = formatted.match(/^([A-ZÄÖÜ]{1,3})-([A-ZÄÖÜ]{1,2})\s(\d{1,4})$/)
  if (!m) return formatted
  const [, stadt, , zahl] = m
  // Buchstaben-Block → XX, Zahlen → letzte 2 Stellen
  const letters = 'XX'
  const shortZahl = zahl.length > 2 ? zahl.slice(-2) : zahl
  return `${stadt}-${letters} ${shortZahl}`
}

/**
 * Kuerzt ein Kennzeichen defensiv auf die DB-Spaltenlaenge, damit ein zu langer
 * Freitext-/Paste-Wert einen Insert nicht mit "value too long for type character
 * varying(20)" abbricht. Betrifft claim_parties.kennzeichen und
 * vehicles.kennzeichen_aktuell (beide varchar(20)). Echte KFZ-Kennzeichen sind
 * <= 11 Zeichen -> bei validem Input kein Datenverlust; leer/whitespace -> null.
 */
export function clampKennzeichenForDb(
  raw: string | null | undefined,
  maxLen = 20,
): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed ? trimmed.slice(0, maxLen) : null
}
