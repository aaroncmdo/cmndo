// Health-Check: Claims-Missing-Pflichtdokumente
// Erkennt aktive, recente Claims ohne Pflichtdokument-Slots (pflichtdokumente-Zeilen).
// Ohne Slots kann der Kunde keine Pflicht-Dokumente hochladen -> Slot-Init im
// Claim-Erstell-Pfad ist fehlgeschlagen. 14-Tage-Fenster haelt die Baseline sauber
// (10 historische slot-lose Alt-Claims sind <=2026-06-15; nur Regressionen sollen feuern).
// Read-only: claims.id/abgeschlossen_am/deaktiviert_am/created_at + pflichtdokumente.fall_id.
// Spec: docs/superpowers/specs/2026-07-07-data-integrity-guard-design.md
import type { HealthCheck, CheckResult } from '@/lib/health/types'

const WINDOW_TAGE = 14
const CRIT_SCHWELLE = 3

type ClaimIdRow = { id: string }
type FallIdRow = { fall_id: string }

export const claimsMissingPflichtdokumenteCheck: HealthCheck = {
  id: 'claims-missing-pflichtdokumente',
  category: 'funnel',
  title: 'Claims ohne Pflichtdokument-Slots',

  async run(ctx): Promise<CheckResult> {
    const cutoff = new Date(Date.now() - WINDOW_TAGE * 86_400_000).toISOString()

    // Query 1: recente aktive Claims (Kandidaten)
    const { data: claimData, error: claimError } = await ctx.supabase
      .from('claims')
      .select('id')
      .is('abgeschlossen_am', null)
      .is('deaktiviert_am', null)
      .gt('created_at', cutoff)

    if (claimError) {
      return { status: 'error', detail: `DB-Fehler beim Laden recenter Claims: ${claimError.message}` }
    }

    const candidateIds = ((claimData ?? []) as ClaimIdRow[]).map((r) => r.id)
    if (candidateIds.length === 0) {
      return { status: 'ok', metric: 0, detail: 'Keine recenten aktiven Claims vorhanden.' }
    }

    // Query 2: welche Kandidaten HABEN Pflichtdokument-Slots
    const { data: pdData, error: pdError } = await ctx.supabase
      .from('pflichtdokumente')
      .select('fall_id')
      .in('fall_id', candidateIds)

    if (pdError) {
      return { status: 'error', detail: `DB-Fehler beim Laden der Pflichtdokumente: ${pdError.message}` }
    }

    const mitSlots = new Set(((pdData ?? []) as FallIdRow[]).map((r) => r.fall_id))
    const fehlend = candidateIds.filter((id) => !mitSlots.has(id))
    const n = fehlend.length

    if (n === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: `Alle ${candidateIds.length} recenten aktiven Claims haben Pflichtdokument-Slots.`,
      }
    }

    return {
      status: n >= CRIT_SCHWELLE ? 'crit' : 'warn',
      metric: n,
      detail: `${n} recente aktive Claims ohne Pflichtdokument-Slots — Slot-Init im Claim-Erstell-Pfad fehlgeschlagen, Kunde kann keine Pflicht-Doku hochladen.`,
      sampleIds: fehlend.slice(0, 5),
    }
  },
}
