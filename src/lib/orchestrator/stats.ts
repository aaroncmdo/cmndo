/**
 * AI-Claim-Orchestrator — Phase 2: Readiness-Statistik.
 *
 * Reine (pure) Funktionen + ein DB-Loader fuer die Admin-Graduierungs-UI.
 * Kein throw — Fehler → leere/nullified Ergebnisse.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getAllPolicies } from './policy'
import { GRADUATION } from './types'
import type { AutoMode, TypeStats } from './types'

// ── Eingabe-Typ fuer windowAndCount ──────────────────────────────────────────

export type DecisionRow = {
  vorschlagTyp: string
  zielRolle: string
  status: string
  entschiedenAm: string
}

export type CountRow = {
  vorschlagTyp: string
  zielRolle: string | null
  angenommen: number
  verworfen: number
}

// ── windowAndCount (pure) ─────────────────────────────────────────────────────

/**
 * Gruppiert Entscheidungen nach (vorschlagTyp, zielRolle), sortiert je Gruppe
 * nach entschiedenAm DESC, nimmt die letzten `windowSize` Eintraege und zaehlt
 * status==='angenommen' vs 'verworfen'.
 *
 * Pure — kein I/O, kein throw.
 */
export function windowAndCount(
  decisions: DecisionRow[],
  windowSize: number,
): CountRow[] {
  if (decisions.length === 0) return []

  // Gruppieren nach (vorschlagTyp, zielRolle)
  const groups = new Map<string, DecisionRow[]>()
  for (const d of decisions) {
    const key = `${d.vorschlagTyp}|${d.zielRolle}`
    const existing = groups.get(key)
    if (existing) {
      existing.push(d)
    } else {
      groups.set(key, [d])
    }
  }

  const result: CountRow[] = []
  for (const [key, rows] of groups) {
    // Sortieren: neueste zuerst (DESC)
    const sorted = [...rows].sort((a, b) =>
      b.entschiedenAm.localeCompare(a.entschiedenAm),
    )

    // Fenster: nur die letzten windowSize nehmen
    const window = sorted.slice(0, windowSize)

    let angenommen = 0
    let verworfen = 0
    for (const row of window) {
      if (row.status === 'angenommen') angenommen++
      else if (row.status === 'verworfen') verworfen++
    }

    const [vorschlagTyp, zielRolle] = key.split('|')
    result.push({ vorschlagTyp, zielRolle, angenommen, verworfen })
  }

  return result
}

// ── computeReadiness (pure) ───────────────────────────────────────────────────

/**
 * Berechnet TypeStats aus einer Zaehlgruppe + dem aktuellen AutoMode.
 *
 * ready === true NUR wenn:
 *   - vorschlagTyp === 'task'
 *   - quote >= GRADUATION.quoteSchwelle  (0.80)
 *   - entscheidungen >= GRADUATION.minEntscheidungen  (30)
 *
 * Alle anderen Typen (escalation, next_step) koennen nie ready sein — Compliance §7.
 *
 * Pure — kein I/O, kein throw.
 */
export function computeReadiness(
  count: { vorschlagTyp: string; zielRolle: string | null; angenommen: number; verworfen: number },
  mode: AutoMode,
): TypeStats {
  const entscheidungen = count.angenommen + count.verworfen
  const quote = entscheidungen > 0 ? count.angenommen / entscheidungen : 0

  const ready =
    count.vorschlagTyp === 'task' &&
    quote >= GRADUATION.quoteSchwelle &&
    entscheidungen >= GRADUATION.minEntscheidungen

  return {
    vorschlagTyp: count.vorschlagTyp as TypeStats['vorschlagTyp'],
    zielRolle: count.zielRolle as TypeStats['zielRolle'],
    entscheidungen,
    angenommen: count.angenommen,
    verworfen: count.verworfen,
    quote,
    mode,
    ready,
  }
}

// ── getTypeStats (DB-Loader) ──────────────────────────────────────────────────

/**
 * Laedt alle entschiedenen Vorschlaege aus ai_claim_proposals,
 * berechnet Readiness je (typ, rolle) ueber das Fenster (GRADUATION.minEntscheidungen).
 *
 * Wirft nie — Fehler → [].
 */
export async function getTypeStats(): Promise<TypeStats[]> {
  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('ai_claim_proposals')
      .select('vorschlag_typ, ziel_rolle, status, entschieden_am')
      .in('status', ['angenommen', 'verworfen'])

    if (error || !data) return []

    // Auf windowAndCount-Input-Format mappen
    const decisions: DecisionRow[] = data.map((row) => ({
      vorschlagTyp: row.vorschlag_typ as string,
      zielRolle: row.ziel_rolle as string,
      status: row.status as string,
      entschiedenAm: (row.entschieden_am as string) ?? '',
    }))

    // Fenster + Zaehlung
    const counts = windowAndCount(decisions, GRADUATION.minEntscheidungen)

    // Policy-Map fuer den Mode-Join
    const policies = await getAllPolicies()

    // TypeStats je Gruppe
    const stats: TypeStats[] = counts.map((count) => {
      const policyKey = `${count.vorschlagTyp}|${count.zielRolle}`
      const mode: AutoMode = policies[policyKey] ?? 'manual'
      return computeReadiness(count, mode)
    })

    return stats
  } catch {
    return []
  }
}
