// Health-Check: Claims-Missing-Pflichtdokumente
// Erkennt aktive, recente Claims ohne Pflichtdokument-Slots (pflichtdokumente-Zeilen).
// Ohne Slots kann der Kunde keine Pflicht-Dokumente hochladen -> Slot-Init im
// Claim-Erstell-Pfad ist fehlgeschlagen. 14-Tage-Fenster haelt die Baseline sauber
// (10 historische slot-lose Alt-Claims sind <=2026-06-15; nur Regressionen sollen feuern).
//
// Test-/interne Claims ausgeschlossen (17.07.): Prod-Smoke-/Fixture-Claims (test-kunde@claimondo.de,
// smoke-*@claimondo.test, ...) werden per Seed/E2E OHNE Slot-Init angelegt und wuerden den Check
// sonst dauerhaft crit halten (taegliche Alert-Fatigue), OHNE dass ein echter Kunde betroffen ist.
// Filter via istInterneEmail (SSoT-Helper: Firmendomain @claimondo.de/.test + test/smoke/e2e-Marker)
// ueber die Lead-Email des Claims -> es feuert nur noch auf echte externe Kunden-Claims.
// Read-only: claims.id/lead_id/abgeschlossen_am/deaktiviert_am/created_at + leads.email + pflichtdokumente.fall_id.
// Spec: docs/superpowers/specs/2026-07-07-data-integrity-guard-design.md
import type { HealthCheck, CheckResult } from '@/lib/health/types'
import { istInterneEmail } from '@/lib/testdaten/interne-identitaet'

const WINDOW_TAGE = 14
const CRIT_SCHWELLE = 3

type ClaimRow = { id: string; lead_id: string | null }
type FallIdRow = { fall_id: string }
type LeadRow = { id: string; email: string | null }

export const claimsMissingPflichtdokumenteCheck: HealthCheck = {
  id: 'claims-missing-pflichtdokumente',
  category: 'funnel',
  title: 'Claims ohne Pflichtdokument-Slots',

  async run(ctx): Promise<CheckResult> {
    const cutoff = new Date(Date.now() - WINDOW_TAGE * 86_400_000).toISOString()

    // Query 1: recente aktive Claims (Kandidaten) + lead_id fuer den Test-Filter.
    const { data: claimData, error: claimError } = await ctx.supabase
      .from('claims')
      .select('id, lead_id')
      .is('abgeschlossen_am', null)
      .is('deaktiviert_am', null)
      .gt('created_at', cutoff)

    if (claimError) {
      return { status: 'error', detail: `DB-Fehler beim Laden recenter Claims: ${claimError.message}` }
    }

    let candidates = (claimData ?? []) as ClaimRow[]
    if (candidates.length === 0) {
      return { status: 'ok', metric: 0, detail: 'Keine recenten aktiven Claims vorhanden.' }
    }

    // Query 1b: Test-/interne Claims ausschliessen (Lead-Email via istInterneEmail).
    // DB-Fehler hier ist NICHT kritisch fuer den Fund -> bei Fehler konservativ ALLE Kandidaten
    // behalten (lieber ein Test-Claim zuviel im Signal als einen echten verstecken).
    const leadIds = [...new Set(candidates.map((c) => c.lead_id).filter(Boolean) as string[])]
    if (leadIds.length > 0) {
      const { data: leadData } = await ctx.supabase.from('leads').select('id, email').in('id', leadIds)
      const interneLeadIds = new Set(
        ((leadData ?? []) as LeadRow[]).filter((l) => istInterneEmail(l.email)).map((l) => l.id),
      )
      candidates = candidates.filter((c) => !(c.lead_id && interneLeadIds.has(c.lead_id)))
    }

    if (candidates.length === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: 'Keine recenten aktiven Kunden-Claims (Test-/interne ausgeschlossen).',
      }
    }

    const candidateIds = candidates.map((c) => c.id)

    // Query 2: welche Kandidaten HABEN Pflichtdokument-Slots.
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
        detail: `Alle ${candidateIds.length} recenten aktiven Kunden-Claims haben Pflichtdokument-Slots.`,
      }
    }

    return {
      status: n >= CRIT_SCHWELLE ? 'crit' : 'warn',
      metric: n,
      detail: `${n} recente aktive Kunden-Claims ohne Pflichtdokument-Slots — Slot-Init im Claim-Erstell-Pfad fehlgeschlagen, Kunde kann keine Pflicht-Doku hochladen.`,
      sampleIds: fehlend.slice(0, 5),
    }
  },
}
