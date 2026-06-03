import type { OnboardingFeld } from '@/components/onboarding/types'

/**
 * Pure: gruppiert DynamicWizard-Felder nach `db_target.tabelle` in
 * `{ tabelle: { spalte: wert } }`-Update-Payloads. Geteilt von beiden Save-Pfaden:
 *   - anon-GFA-Save (`saveOnboardingStep`, gutachter-finden-Front, allowedTables=GFA)
 *   - token-validierter service_role-Save (Beauftragung-FlowLink, allowedTables=leads)
 *
 * `allowedTables` ist die Sicherheits-Grenze (nur explizit erlaubte Tabellen
 * werden geschrieben — verhindert, dass ein manipuliertes db_target auf eine
 * fremde Tabelle zielt). Feld-Typ-Transforms hier zentral (checkbox → TIMESTAMPTZ).
 * Tabellen-spezifische Side-Effects (z.B. GFA `sa_unterzeichnet_am`) bleiben beim Caller.
 */
export function groupFelderByTarget(
  felder: OnboardingFeld[],
  values: Record<string, unknown>,
  opts: { allowedTables: Set<string>; now?: () => string },
): Record<string, Record<string, unknown>> {
  const now = opts.now ?? (() => new Date().toISOString())
  const out: Record<string, Record<string, unknown>> = {}

  for (const feld of felder) {
    const { tabelle, spalte } = feld.db_target
    if (!opts.allowedTables.has(tabelle)) continue
    if (!(feld.feld_key in values)) continue
    let val = values[feld.feld_key]
    if (val === undefined) continue

    // checkbox → TIMESTAMPTZ: true = jetzt, false = null (Konvention aus saveStep).
    if (feld.typ === 'checkbox') {
      val = val === true ? now() : null
    }

    if (!out[tabelle]) out[tabelle] = {}
    out[tabelle][spalte] = val
  }

  return out
}
