import type { OnboardingFeld } from '@/components/onboarding/types'
import type { OnboardingWriteContext } from '../write-context'

// Ergebnis eines Handler-Writes — id = die betroffene Ziel-Row (claimId/leadId/anfrageId/svId),
// die der Router als anfrageId zurueckgibt (Client-Kontinuitaet, v.a. gfa-Shell-Insert).
export type OnboardingApplyResult =
  | { ok: true; id: string }
  | { ok: false; error: string; reason?: 'anfrage_not_found' | 'rate_limited' }

// Ein Per-Tabelle-Handler besitzt die GESAMTE Schreib-Logik fuer seine db_target.tabelle:
// Target-Row aufloesen + Ownership-Gate + Spalten-Allowlist + Coercion + Write — inkl. der
// table-spezifischen Idiosynkrasien (gfa Shell-Insert + Rate-Limit + Signatur-Side-Effect,
// claim_parties on-demand-Insert, leads dual-auth + derived columns, sv whitelist +
// mass-assignment-guard). Der Router gruppiert felder nur nach tabelle und dispatcht;
// fehlt ein Handler -> harter Fehler (kein stilles continue).
export type OnboardingTableHandler = {
  tabelle: string
  apply: (
    ctx: OnboardingWriteContext,
    felder: OnboardingFeld[],
    values: Record<string, unknown>,
    now: () => string,
  ) => Promise<OnboardingApplyResult>
}

// Shared: baut {spalte: coercedValue} aus felder, hart gefiltert auf writableColumns (Defense-in-
// Depth ZUSAETZLICH zur Config) mit per-feld coerce. Nicht-erlaubte Spalten werden geloggt +
// uebersprungen (nicht still verschluckt). gfa/sv nutzen eigene Varianten.
export function buildAllowlistedUpdates(
  felder: OnboardingFeld[],
  values: Record<string, unknown>,
  writableColumns: ReadonlySet<string>,
  coerce: (spalte: string, val: unknown, typ: string) => unknown,
  label: string,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  for (const feld of felder) {
    const spalte = feld.db_target?.spalte
    if (!spalte || !writableColumns.has(spalte)) {
      if (spalte) console.warn(`[onboarding:${label}] Spalte nicht in Allowlist, uebersprungen:`, spalte)
      continue
    }
    if (!(feld.feld_key in values)) continue
    const val = values[feld.feld_key]
    if (val === undefined) continue
    updates[spalte] = coerce(spalte, val, feld.typ)
  }
  return updates
}
