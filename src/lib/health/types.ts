// Health-Check-Framework — gemeinsame Typen.
// Spec: docs/superpowers/specs/2026-06-29-pipeline-observability-design.md
//
// Jeder Check ist eine reine async-Funktion ueber den injizierten Admin-Client
// (CheckCtx) -> CheckResult. Read-only ueber vorhandene Daten (Effekt-basiert).

import type { SupabaseClient } from '@supabase/supabase-js'

export type HealthStatus = 'ok' | 'warn' | 'crit' | 'error'

export type CheckResult = {
  status: HealthStatus
  /** primaere Kennzahl (z.B. Anzahl stuck) — fuers Dashboard */
  metric?: number
  /** menschenlesbar, deutsch (Dashboard + Alert) */
  detail: string
  /** bis ~5 Beispiel-IDs zur Triage */
  sampleIds?: string[]
}

export type CheckCtx = { supabase: SupabaseClient }

export type HealthCheck = {
  /** stabil, kebab-case (z.B. 'funnel-stuck-claims') */
  id: string
  category: 'funnel' | 'cron' | 'sends' | 'config'
  /** deutsch, Dashboard-Label */
  title: string
  run: (ctx: CheckCtx) => Promise<CheckResult>
}

/** Verschlechterungs-Vergleich (Alerting): 'error' wird wie 'crit' behandelt. */
export const STATUS_RANK: Record<HealthStatus, number> = {
  ok: 0,
  warn: 1,
  error: 2,
  crit: 2,
}
