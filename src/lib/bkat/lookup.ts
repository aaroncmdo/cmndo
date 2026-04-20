// AAR-503 (B1): Helper für BKat-Tatbestandskatalog-Lookups.
// Nutzt Admin-Client, weil die Tabelle auch von Cron-Jobs / OCR-Routen
// (AAR-504) ohne User-Session gelesen wird.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'

export type BkatTatbestand = Database['public']['Tables']['bkat_tatbestaende']['Row']
export type BkatSchuldindiz = Database['public']['Enums']['bkat_schuldindiz']
export type BkatUnfallart = Database['public']['Enums']['bkat_unfallart']

// In-memory Cache. Die Tabelle ändert sich nicht pro Request — eine einzige
// Lookup-Round-Trip pro TBNR pro Prozess-Lifetime reicht.
const cache = new Map<string, BkatTatbestand | null>()

/** Validates a 6-digit TBNR string (no leading zeros in a real TBNR since
 * Vorschrift-Digit is 1-9). */
export function isValidTbnrFormat(tbnr: string): boolean {
  return /^[1-9]\d{5}$/.test(tbnr)
}

/**
 * Lädt einen Tatbestand aus der DB. Return null wenn nicht gefunden oder
 * Format ungültig. Gecached.
 */
export async function lookupTbnr(tbnr: string): Promise<BkatTatbestand | null> {
  if (!isValidTbnrFormat(tbnr)) return null
  if (cache.has(tbnr)) return cache.get(tbnr) ?? null

  const db = createAdminClient()
  const { data } = await db
    .from('bkat_tatbestaende')
    .select('*')
    .eq('tbnr', tbnr)
    .maybeSingle()

  cache.set(tbnr, data ?? null)
  return data ?? null
}

/**
 * Extrahiert alle potenziellen 6-stelligen TBNRs aus einem freien Text
 * (z.B. Polizeibericht via OCR). Prüft jeden gegen die DB und gibt nur
 * die tatsächlich existierenden Tatbestände zurück.
 *
 * AAR-504 (B2) nutzt das zum automatischen Schuldfrage-Hint beim
 * Polizeibericht-Upload.
 */
export async function extractTbnrsFromText(text: string): Promise<BkatTatbestand[]> {
  const matches = text.match(/\b[1-9]\d{5}\b/g) ?? []
  const unique = [...new Set(matches)]
  if (unique.length === 0) return []

  const results = await Promise.all(unique.map(lookupTbnr))
  return results.filter((r): r is BkatTatbestand => r !== null)
}

/**
 * Aggregiert die stärkste Schuld-Indikation aus einer Liste von Tatbeständen.
 * Priorität: gegner_klar > gegner_wahrscheinlich > geteilt > neutral > kunde_verdacht.
 * Wenn die Liste kunde_verdacht enthält, wird das explizit reported damit der
 * Dispatcher den Kunden auf eine mögliche Teilschuld anspricht (AAR-124).
 */
export function aggregateSchuldindiz(
  tatbestaende: BkatTatbestand[],
): { primaer: BkatSchuldindiz | null; kundeVerdacht: boolean } {
  if (tatbestaende.length === 0) return { primaer: null, kundeVerdacht: false }
  const kundeVerdacht = tatbestaende.some((t) => t.schuldindiz === 'kunde_verdacht')
  const ranking: BkatSchuldindiz[] = [
    'gegner_klar',
    'gegner_wahrscheinlich',
    'geteilt',
    'neutral',
    'kunde_verdacht',
  ]
  for (const level of ranking) {
    if (tatbestaende.some((t) => t.schuldindiz === level)) {
      return { primaer: level, kundeVerdacht }
    }
  }
  return { primaer: null, kundeVerdacht }
}

/** Mapped die 15 bkat_unfallart-Werte auf die 5 Legacy-schadentyp-Werte. */
export function bkatToLegacySchadentyp(u: BkatUnfallart): string {
  switch (u) {
    case 'auffahrunfall':
      return 'auffahrunfall'
    case 'vorfahrt':
    case 'kreuzung_rotlicht':
    case 'abbiegen':
      return 'vorfahrtsverletzung'
    case 'spurwechsel':
    case 'ueberholen':
      return 'spurwechsel'
    case 'rueckwaerts_parken':
    case 'einfahren_anfahren':
    case 'dooring':
      return 'parkplatz'
    default:
      return 'sonstiges'
  }
}
