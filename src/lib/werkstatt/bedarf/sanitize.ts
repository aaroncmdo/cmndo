// Server-seitige Sanitisierung von Client-geliefertem Reparaturbedarf.
// Der Embed-Client kann bedarf frei senden (steuert Hart-Filter + wird als
// bedarf_* persistiert). Rein (keine Seiteneffekte). Garantiert:
// - kategorien: nur valide Gewerke (istGewerk-Filter)
// - confidence: geclamped 0..100 (schuetzt u.a. int2-Persist vor Overflow)
// - quelle: valide BedarfQuelle, sonst 'unbekannt'

import { istGewerk, type BedarfQuelle, type Gewerk, type Reparaturbedarf } from './types'

const ERLAUBTE_QUELLEN: readonly BedarfQuelle[] = [
  'gutachten',
  'schadenbild',
  'schadenbeschreibung',
  'kva',
  'manuell',
  'unbekannt',
]

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Normalisiert unvertrauten Bedarf zu einem sicheren Reparaturbedarf.
 * Nicht-Objekte / fehlende Felder → sicherer unbekannt-Default.
 */
export function sanitizeBedarf(b: unknown): Reparaturbedarf {
  if (!b || typeof b !== 'object') return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
  const raw = b as { kategorien?: unknown; quelle?: unknown; confidence?: unknown }

  const kategorien: Gewerk[] = (Array.isArray(raw.kategorien) ? raw.kategorien : []).filter(istGewerk)

  const quelle: BedarfQuelle =
    typeof raw.quelle === 'string' && (ERLAUBTE_QUELLEN as readonly string[]).includes(raw.quelle)
      ? (raw.quelle as BedarfQuelle)
      : 'unbekannt'

  const confidence = clamp(Number(raw.confidence) || 0, 0, 100)

  return { kategorien, quelle, confidence }
}
