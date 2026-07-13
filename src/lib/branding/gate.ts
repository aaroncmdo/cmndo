// FG3 — Branding-Gate shared predicates.
// Extracts the customer-facing gate (verifiziert && use_custom_branding) and the
// intentionally-different SV-own gate (use_custom_branding alone) into two named,
// pure fields-in/bool-out helpers so the asymmetry is explicit, not a scattered bug.

/** Fields both branding predicates read. Superset kept minimal & explicit. */
export type BrandingGateFields = {
  verifiziert: boolean | null
  use_custom_branding: boolean | null
}

/**
 * Customer-facing gate: the Kunde/Magic-Link/Email surfaces show the SV's brand
 * ONLY when the SV is verified AND opted into custom branding. Unverified partners
 * never brand the customer's view (Anti-Versuchskaninchen / brand-trust / access).
 */
export function kundenBrandingErlaubt(sv: BrandingGateFields | null | undefined): boolean {
  return sv?.verifiziert === true && sv?.use_custom_branding === true
}

/**
 * SV-own-portal gate: the SV may customise its OWN portal (and org sub-SVs inherit)
 * as soon as use_custom_branding is on — deliberately BEFORE verification, so the SV
 * can brand during onboarding. Named distinctly so the asymmetry is explicit, not a bug.
 */
export function svEigenBrandingErlaubt(
  entity: Pick<BrandingGateFields, 'use_custom_branding'> | null | undefined,
): boolean {
  return entity?.use_custom_branding === true
}
