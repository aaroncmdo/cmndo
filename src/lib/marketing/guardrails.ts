/**
 * Guardrails fuers Marketing-Content-Studio: Kill-Switch + Wochen-Kosten-Cap.
 * Werden VOR jeder Generierung geprueft (im Orchestrator).
 */

export function studioEnabled(): boolean {
  return process.env.MARKETING_STUDIO_ENABLED !== 'false'
}

export function maxClipsPerWeek(): number {
  const n = Number(process.env.MARKETING_MAX_CLIPS_PER_WEEK)
  return Number.isFinite(n) && n > 0 ? n : 20
}

/** recentCount = Anzahl Jobs der letzten 7 Tage (der Orchestrator zaehlt sie in der DB). */
export function checkGuardrails(recentCount: number): { ok: boolean; error?: string } {
  if (!studioEnabled()) {
    return { ok: false, error: 'Marketing-Studio ist deaktiviert (MARKETING_STUDIO_ENABLED=false).' }
  }
  const cap = maxClipsPerWeek()
  if (recentCount >= cap) {
    return { ok: false, error: `Wochen-Limit erreicht (${recentCount}/${cap}). MARKETING_MAX_CLIPS_PER_WEEK anpassen.` }
  }
  return { ok: true }
}
