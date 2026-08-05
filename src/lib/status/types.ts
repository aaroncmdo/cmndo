// src/lib/status/types.ts
// Pure types for the status/badge registry. NO React, NO lucide imports.

export type StatusSlot =
  | 'neutral' | 'active' | 'pending' | 'done'
  | 'success' | 'warning' | 'danger'

// Matches src/lib/claims/timeline-queries.ts. Extend the union in a later
// wave if a domain needs makler/werkstatt/etc. label variants.
export type ViewerRole = 'admin' | 'kb' | 'sv' | 'kunde'

// Registry domain keys. Extended per wave.
export type DomainName = 'fall-status' | 'fall-phase' | 'claim-main-phase' | 'claims-status' | 'lead-workflow' | 'vertrieb-workflow' | 'cold-mail' | 'partner-aktivitaet'

export type StatusDef = {
  /** Default / Fachsprache */
  label: string
  /** Optional role-specific variants (generalizes labelKunde) */
  labelByRole?: Partial<Record<ViewerRole, string>>
  /** Optional short label (tables/kanban) */
  short?: string
  /** Color = a token slot, never a raw class. Omitted -> neutral. */
  slot?: StatusSlot
  /** Optional terminal-state flag */
  isEndzustand?: boolean
  /** Optional icon key; the LucideIcon lives in icons.tsx */
  iconKey?: string
}
