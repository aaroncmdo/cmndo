import type { OnboardingFeld, SaveOnboardingResult } from '@/components/onboarding/types'
import type { OnboardingWriteContext } from './write-context'
import type { OnboardingTableHandler } from './table-handlers/types'
import { REGISTRY } from './table-handlers/registry'

// CMM-49 Onboarding-Writer-Kanonisierung: EIN Router. Gruppiert felder nach db_target.tabelle und
// dispatcht jede Gruppe an den registrierten Per-Tabelle-Handler.
//   - '_'-prefixed Targets (_finalize/_termin/_self) sind KEINE Feld-DB-Writes -> uebersprungen
//     (Flow-Finalizer-Sache: Signatur, Termin-Buchung, SV-Self).
//   - Fehlt ein Handler -> HARTER Fehler (kein stilles continue) -> tote/falsche Config-Targets
//     werden laut statt stumm verschluckt.
//   - Per-Tabelle-Ownership + Allowlist + Coercion liegen im jeweiligen Handler (die Sicherheits-
//     grenze bleibt pro Tabelle, der Router delegiert nur).
// registry ist injizierbar (Default REGISTRY) — fuer Unit-Tests ohne DB-Deps.
export async function saveOnboardingFields(
  ctx: OnboardingWriteContext,
  felder: OnboardingFeld[],
  values: Record<string, unknown>,
  registry: Record<string, OnboardingTableHandler> = REGISTRY,
): Promise<SaveOnboardingResult> {
  const now = () => new Date().toISOString()

  // Gruppieren — felder behalten (NICHT auf {spalte:wert} kollabieren), damit Handler typ-aware
  // coercen + ihre Allowlist anwenden koennen. '_'-Targets raus.
  const byTable = new Map<string, OnboardingFeld[]>()
  for (const feld of felder) {
    const tabelle = feld.db_target?.tabelle
    if (!tabelle || tabelle.startsWith('_')) continue
    if (!byTable.has(tabelle)) byTable.set(tabelle, [])
    byTable.get(tabelle)!.push(feld)
  }

  // gfa-Id gesondert merken: sie ist die Client-Kontinuitaets-anfrageId (Shell-Insert vergibt sie).
  let gfaId: string | null = null
  for (const [tabelle, felderForTable] of byTable) {
    const handler = registry[tabelle]
    if (!handler) {
      console.error(`[saveOnboardingFields] unbekanntes db_target.tabelle=${tabelle} (kein Handler registriert)`)
      return { ok: false, error: `Onboarding: unbekanntes Speicherziel (${tabelle})` }
    }
    const r = await handler.apply(ctx, felderForTable, values, now)
    if (!r.ok) return { ok: false, error: r.error, reason: r.reason }
    if (tabelle === 'gutachter_finder_anfragen') gfaId = r.id
  }

  return { ok: true, anfrageId: gfaId ?? ctx.anfrageId ?? ctx.fallId ?? ctx.leadId ?? ctx.svId ?? '' }
}
