// src/lib/status/domains/vertrieb-workflow.ts
// Vertrieb-CRM P0 (2026-07-08): Registry-Domain fuer den abgeleiteten Partner-
// Lebenszyklus-Zustand (deriveVertriebState). Label + Farb-Slot je Stufe — das
// Badge-Rendering laeuft ueber <StatusBadge domain="vertrieb-workflow">.
// Partner-seitiger Zwilling von lead-workflow (gleiche Mechanik, eigene Domaene).
import type { StatusDef } from '../types'

export const VERTRIEB_WORKFLOW_DEFS = {
  neu: { label: 'Neu', short: 'Neu', slot: 'neutral' },
  kontaktiert: { label: 'Kontaktiert', short: 'Kontakt', slot: 'active' },
  onboarding: { label: 'Onboarding', short: 'Onboard', slot: 'pending' },
  aktiv: { label: 'Aktiv', short: 'Aktiv', slot: 'success' },
  pausiert: { label: 'Pausiert', short: 'Pause', slot: 'warning' },
  gesperrt: { label: 'Gesperrt', short: 'Gesperrt', slot: 'danger' },
  verloren: { label: 'Verloren', short: 'Verloren', slot: 'neutral', isEndzustand: true },
} satisfies Record<string, StatusDef>

export type VertriebStufe = keyof typeof VERTRIEB_WORKFLOW_DEFS
export const ALL_VERTRIEB_STUFEN = Object.keys(VERTRIEB_WORKFLOW_DEFS) as VertriebStufe[]
