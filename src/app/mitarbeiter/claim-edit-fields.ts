// Whitelist der editierbaren claims-Felder fuer das KB-Cockpit (Phase 1b/1c).
// Bewusst KEIN 'use server' — Next.js verbietet Nicht-async-Exports aus 'use server'-Files
// (AAR-664: Konstanten aus 'use server' werden im Client-Bundle undefined / brechen den Build).
// Die Server-Action (claim-edit-actions.ts) importiert die Liste von hier.
export const ALLOWED_CLAIM_FIELDS = ['notizen', 'interne_notizen', 'schadens_hoehe_netto'] as const
export type AllowedField = (typeof ALLOWED_CLAIM_FIELDS)[number]
