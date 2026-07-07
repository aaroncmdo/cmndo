/**
 * AI-Claim-Orchestrator — Phase 2: Auto-Policy-Verwaltung + Safety-Guard.
 *
 * Tabelle: orchestrator_auto_policy (vorschlag_typ, ziel_rolle, mode, ...)
 * Safe-by-default: keine Zeile = manual. Kill-Switch global via env.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { AutoMode } from './types'

// ── Safety-Guard (pure, kein I/O) ────────────────────────────────────────────

/**
 * Entscheidet ob ein Vorschlag auto-ausgefuehrt werden darf.
 *
 * Gibt `true` NUR wenn:
 *   - vorschlagTyp === 'task'  (Scope: nur Task-Routing; escalation/next_step NIE — §7 Compliance)
 *   - mode === 'auto'          (Policy-Zeile zeigt 'auto')
 *   - killSwitchOn === true    (ORCHESTRATOR_AUTO_ENABLED=true, globaler Notausschalter)
 *
 * Sonst immer false.
 */
export function isAutoEligible(
  vorschlagTyp: string,
  mode: AutoMode,
  killSwitchOn: boolean,
): boolean {
  return vorschlagTyp === 'task' && mode === 'auto' && killSwitchOn === true
}

// ── Kill-Switch ───────────────────────────────────────────────────────────────

/**
 * Liest globalen Kill-Switch aus ORCHESTRATOR_AUTO_ENABLED.
 * Default false — Phase 2 shippt schlafend, bis explizit aktiviert.
 */
export function isKillSwitchOn(): boolean {
  return process.env.ORCHESTRATOR_AUTO_ENABLED === 'true'
}

// ── DB-Lesen ──────────────────────────────────────────────────────────────────

/**
 * Liest den aktuellen AutoMode fuer (vorschlagTyp, zielRolle) aus der Policy-Tabelle.
 * Gibt 'manual' zurueck wenn keine Zeile existiert (safe-by-default).
 * Wirft nie.
 */
export async function getAutoMode(vorschlagTyp: string, zielRolle: string): Promise<AutoMode> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('orchestrator_auto_policy')
      .select('mode')
      .eq('vorschlag_typ', vorschlagTyp)
      .eq('ziel_rolle', zielRolle)
      .maybeSingle()

    if (error || !data) return 'manual'

    const mode = data.mode
    if (mode === 'auto' || mode === 'manual') return mode
    return 'manual'
  } catch {
    return 'manual'
  }
}

// ── DB-Schreiben ──────────────────────────────────────────────────────────────

/**
 * Setzt den AutoMode fuer (vorschlagTyp, zielRolle) per Upsert.
 * Schreibt Audit-Felder (geflippt_von, geflippt_am, aktualisiert_am).
 * Result-Object, kein throw.
 */
export async function setAutoMode(
  vorschlagTyp: string,
  zielRolle: string,
  mode: AutoMode,
  userId: string,
  autoRevertGrund?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { error } = await supabase.from('orchestrator_auto_policy').upsert(
      {
        vorschlag_typ: vorschlagTyp,
        ziel_rolle: zielRolle,
        mode,
        geflippt_von: userId,
        geflippt_am: now,
        aktualisiert_am: now,
        auto_revert_grund: autoRevertGrund ?? null,
      },
      { onConflict: 'vorschlag_typ,ziel_rolle' },
    )

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler in setAutoMode'
    return { ok: false, error: message }
  }
}

// ── Alle Policies laden (fuer Stats-Join) ─────────────────────────────────────

/**
 * Laedt alle Policy-Zeilen als Map { "${vorschlag_typ}|${ziel_rolle}" → mode }.
 * Fehler → leeres Objekt (caller faellt auf 'manual' zurueck).
 */
export async function getAllPolicies(): Promise<Record<string, AutoMode>> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('orchestrator_auto_policy')
      .select('vorschlag_typ, ziel_rolle, mode')

    if (error || !data) return {}

    const result: Record<string, AutoMode> = {}
    for (const row of data) {
      const mode: AutoMode = row.mode === 'auto' ? 'auto' : 'manual'
      result[`${row.vorschlag_typ}|${row.ziel_rolle}`] = mode
    }
    return result
  } catch {
    return {}
  }
}
