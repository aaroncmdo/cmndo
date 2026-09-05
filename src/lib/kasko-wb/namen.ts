// Namens-Abgleich fuer die Wissensbasis (Berater-API: versicherer=/tarif= als Text). Pure, client-safe.
// Regel: exakter Treffer (normalisiert) gewinnt; sonst genau EIN Teiltreffer; mehrere -> mehrdeutig (nie raten).
// Kasko-WB Phase 2 (Spec 2026-09-05, D5): ein LLM kennt „HUK-COBURG" und „Classic SELECT", keine UUIDs.

const RECHTSFORMEN = /\b(versicherung(en)?|versicherungs-?ag|ag|se|gmbh|vvag|a\.g\.|kfz)\b/g

/** klein, ohne Rechtsform, ohne Umlaute/Satzzeichen/Leerraum — „Huk Coburg Versicherung AG" -> „hukcoburg". */
export function normalisiereName(s: string): string {
  return s
    .toLowerCase()
    .replace(RECHTSFORMEN, ' ')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '')
}

export type Treffer<T> =
  | { status: 'eindeutig'; treffer: T }
  | { status: 'mehrdeutig'; kandidaten: T[] }
  | { status: 'kein_treffer' }

/**
 * Waehlt aus Kandidaten den zum Suchbegriff passenden: erst exakt (normalisiert), dann Teiltreffer in beide
 * Richtungen („coburg" in „hukcoburg", „hukcoburgversicherung" enthaelt „hukcoburg"). Mehrere Teiltreffer sind
 * mehrdeutig — der Aufrufer legt sie dem Nutzer vor, statt zu raten.
 */
export function waehleTreffer<T extends { name: string }>(kandidaten: T[], gesucht: string): Treffer<T> {
  const g = normalisiereName(gesucht)
  if (!g) return { status: 'kein_treffer' }
  const exakt = kandidaten.filter((k) => normalisiereName(k.name) === g)
  if (exakt.length === 1) return { status: 'eindeutig', treffer: exakt[0] }
  if (exakt.length > 1) return { status: 'mehrdeutig', kandidaten: exakt }
  const teil = kandidaten.filter((k) => {
    const n = normalisiereName(k.name)
    return n.length > 0 && (n.includes(g) || g.includes(n))
  })
  if (teil.length === 1) return { status: 'eindeutig', treffer: teil[0] }
  if (teil.length > 1) return { status: 'mehrdeutig', kandidaten: teil }
  return { status: 'kein_treffer' }
}
