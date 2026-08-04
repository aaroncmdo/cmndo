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

// ─── Paid-Perk (Aaron 03.08.): Whitelabel-WIRKUNG nur fuer zahlende SVs ────────
// Entscheid: bezahlt = Netzwerkpartner-Abo (aktiv|comped|ueberfaellig — dieselbe
// Menge wie der Finder-Boost; ueberfaellig behaelt den Vorteil bis zum
// Dunning-Karenz-Cancel) ODER Legacy-Paid-Paket mit BEZAHLTER Anzahlung.
// anzahlung_status (nicht onboarding_status/portal_zugang!) ist der verlaessliche
// Paid-Marker — portal_zugang_freigeschaltet setzt auch die Basic-Auto-Freigabe.
// Downgrade ist derive-at-read: der Dunning-Cron flippt den Abo-Status, der
// naechste Read rendert Claimondo. use_custom_branding bleibt reiner User-Intent
// (wird NIE automatisch geschrieben) — Re-Subscribe reaktiviert die Wirkung sofort.
// Konsequenz fuer Paid-Onboarding: VOR bezahlter Anzahlung brandet auch das
// eigene Portal nicht (Editor-Preview bleibt davon unberuehrt) — gewollt.

/** Zusaetzliche Felder fuer das Bezahl-Praedikat (sachverstaendige-Row). */
export type BezahlGateFields = {
  paket: string | null
  anzahlung_status: string | null
}

/** Abo-Status, die als "zahlend" gelten (Kanon: wie istNetzwerkpartner/Finder-Boost). */
export const BRANDING_ZAHLEND_ABO_STATUS = ['aktiv', 'comped', 'ueberfaellig'] as const

/** Pure: zaehlt dieser SV fuer die Whitelabel-Wirkung als zahlend? */
export function brandingBezahlt(
  sv: BezahlGateFields | null | undefined,
  aboStatus: string | null | undefined,
): boolean {
  if (aboStatus && (BRANDING_ZAHLEND_ABO_STATUS as readonly string[]).includes(aboStatus)) {
    return true
  }
  return (sv?.paket ?? 'basic') !== 'basic' && sv?.anzahlung_status === 'bezahlt'
}
