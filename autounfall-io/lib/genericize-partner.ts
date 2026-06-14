// Verkehrsrechts-Partnerkanzlei generisch (Cowork-Entscheidung 2026-06-12 —
// ueberschreibt die alte „LexDrive bleibt benannt"-Linie). Die namentliche Nennung
// (frueher „LexDrive UG", Link lex-drive.com) wird site-weit entfernt; das
// E-E-A-T-/Trust-Signal bleibt unbenannt erhalten.
//
// Diese Funktion laeuft NUR ueber GENERIERTE Bodies/FAQ/quickAnswer im Merge-Layer
// (content/articles/index.ts, content/rest-pages/index.ts) → die *.generated.ts-
// Dateien bleiben unveraendert (git diff = 0). Manuelle Vergleichs-Seiten
// (Claimondo-Kontext, UWG-§6-Transparenz) sind bewusst AUSGENOMMEN.
//
// Singular „Partnerkanzlei" (real = 1 Kanzlei) — auf Plural umstellbar, sobald ≥2.

const PARTNER = 'unsere Verkehrsrechts-Partnerkanzlei'

export function genericizePartner(text: string): string {
  return (
    text
      // 1) Markdown-Link, der LexDrive nennt, auf lex-drive.com → generisch + /gutachter-finden
      .replace(
        /\[[^\]]*?LexDrive[^\]]*?\]\(https?:\/\/(?:www\.)?lex-drive\.com[^)]*\)/gi,
        `[${PARTNER}](/gutachter-finden)`,
      )
      // 2) sonstige lex-drive.com-Linkziele in Markdown → /gutachter-finden
      .replace(/\(https?:\/\/(?:www\.)?lex-drive\.com[^)]*\)/gi, '(/gutachter-finden)')
      // 3) nackte URLs
      .replace(/https?:\/\/(?:www\.)?lex-drive\.com[^\s)"'\]]*/gi, '/gutachter-finden')
      // 4) „(Partner-)Kanzlei LexDrive (UG)" → „Verkehrsrechts-Partnerkanzlei"
      .replace(/(?:Partner-?)?[Kk]anzlei\s+LexDrive(?:\s+UG)?/g, 'Verkehrsrechts-Partnerkanzlei')
      // 5) „LexDrive UG" → generisch
      .replace(/LexDrive\s+UG/gi, PARTNER)
      // 6) verbleibendes „LexDrive"
      .replace(/LexDrive/gi, PARTNER)
  )
}

// Strukturelle Keys, die NICHT angefasst werden (Routen/Slugs/IDs/Daten/Enums/Bildpfade).
const SKIP_KEYS = new Set([
  'slug', 'route', 'url', 'src', 'author', 'kind', 'cluster', 'datePublished', 'dateModified',
])

// Deep-Transform: genericizePartner auf ALLE String-Felder eines Content-Objekts
// (Article/RestPage/Decoder, inkl. atAGlance/sections/tldr/metaDesc), strukturelle
// Keys ausgenommen. Nur lex-drive-/LexDrive-Strings aendern sich.
export function deepGenerifyContent<T>(value: T): T {
  if (typeof value === 'string') return genericizePartner(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => deepGenerifyContent(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SKIP_KEYS.has(k) ? v : deepGenerifyContent(v)
    }
    return out as T
  }
  return value
}
