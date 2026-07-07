// Health-Check: Claims-Missing-Geschaedigter
// Erkennt aktive Claims ohne geschaedigte Partei (claim_parties rolle='geschaedigter').
// Ohne diese Partei laufen Kunde-/Halter-Edits in der Fallakte ins Leere:
// die Claim-Erstellung hat keine geschaedigter-Zeile angelegt. Harte Invariante,
// kein Zeitfenster -> jede Verletzung = echte Regression.
// Read-only: claims.id/deaktiviert_am + claim_parties.claim_id/rolle.
// Spec: docs/superpowers/specs/2026-07-07-data-integrity-guard-design.md
import type { HealthCheck, CheckResult } from '@/lib/health/types'

const CRIT_SCHWELLE = 3

type ClaimIdRow = { id: string }
type PartyRow = { claim_id: string }

export const claimsMissingGeschaedigterCheck: HealthCheck = {
  id: 'claims-missing-geschaedigter',
  category: 'funnel',
  title: 'Claims ohne geschädigte Partei',

  async run(ctx): Promise<CheckResult> {
    // Query 1: alle aktiven Claims (Kandidaten)
    const { data: claimData, error: claimError } = await ctx.supabase
      .from('claims')
      .select('id')
      .is('deaktiviert_am', null)

    if (claimError) {
      return { status: 'error', detail: `DB-Fehler beim Laden der Claims: ${claimError.message}` }
    }

    const candidateIds = ((claimData ?? []) as ClaimIdRow[]).map((r) => r.id)
    if (candidateIds.length === 0) {
      return { status: 'ok', metric: 0, detail: 'Keine aktiven Claims vorhanden.' }
    }

    // Query 2: welche Kandidaten HABEN eine geschaedigter-Partei
    const { data: partyData, error: partyError } = await ctx.supabase
      .from('claim_parties')
      .select('claim_id')
      .eq('rolle', 'geschaedigter')
      .in('claim_id', candidateIds)

    if (partyError) {
      return { status: 'error', detail: `DB-Fehler beim Laden der claim_parties: ${partyError.message}` }
    }

    const mitPartei = new Set(((partyData ?? []) as PartyRow[]).map((r) => r.claim_id))
    const fehlend = candidateIds.filter((id) => !mitPartei.has(id))
    const n = fehlend.length

    if (n === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: `Alle ${candidateIds.length} aktiven Claims haben eine geschädigte Partei.`,
      }
    }

    return {
      status: n >= CRIT_SCHWELLE ? 'crit' : 'warn',
      metric: n,
      detail: `${n} Claims ohne geschädigte Partei — Claim-Erstellung hat keine geschaedigter-claim_parties-Zeile angelegt, Kunde-/Halter-Edits in der Fallakte greifen nicht.`,
      sampleIds: fehlend.slice(0, 5),
    }
  },
}
