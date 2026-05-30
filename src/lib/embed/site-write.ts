// AAR-939 · Monika-Embed · Stream 6 — Embed-Site Write-Shape + Validierung.
//
// PURE Modul (kein 'use server', kein 'server-only') → importierbar in Client
// (Wizard-Validierung + Theme-Preview) UND Server (actions.ts). Die Domain-
// Normalisierung (extractHost) lebt bewusst NICHT hier, sondern in der Server-
// Action — anfrage.ts ist server-only und darf nicht in den Client-Wizard.

export type EmbedSiteVariante = 'A' | 'B'

/** Form-Daten, die der Wizard an die Server-Action uebergibt. */
export interface EmbedSiteFormData {
  name: string
  slug: string
  variante: EmbedSiteVariante
  erlaubte_domains: string[]
  empfaenger_email: string
  cc_email: string
  // Theme-Overrides (nur Variante B wirksam; bleiben fuer A->B in DB erhalten)
  brand_primary_override: string
  brand_secondary_override: string
  brand_accent_override: string
  brand_logo_url_override: string
  // Q7-Consent (nur Variante B Pflicht)
  agb_akzeptiert: boolean
}

/** AGB-Versions-Hash, der bei Variante-B-Zustimmung gespeichert wird (Q7). */
export const MONIKA_AGB_VERSION = 'monika-koop-agb-2026-05'

/** slug: lowercase, Ziffern, Bindestrich; 3–40 Zeichen, kein fuehrender/Trailing-Strich. */
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug)
}

export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email)
}

/** Claimondo-Default-Theme (flach, spiegelt /api/embed/config Stream 5). */
export const CLAIMONDO_FLAT_THEME = {
  primary: '#0D1B3E',
  accent: '#4573A2',
  text: '#0F2429',
} as const

/**
 * Loest das flache 4-Feld-Theme exakt wie der Config-Endpoint auf (WYSIWYG) —
 * damit die Wizard-Preview zeigt, was das Widget tatsaechlich rendert.
 * Variante A erzwingt Claimondo-Default; B nutzt Override ?? SV-Brand ?? Default.
 */
export function resolvePreviewTheme(
  form: Pick<EmbedSiteFormData, 'variante' | 'brand_primary_override' | 'brand_secondary_override' | 'brand_accent_override' | 'brand_logo_url_override'>,
  svBrand: { brand_primary: string | null; brand_accent: string | null } | null,
  defaultLogo: string,
): { primary: string; accent: string; text: string; logoUrl: string; brandedByClaimondo: boolean } {
  if (form.variante === 'B') {
    return {
      primary: form.brand_primary_override || svBrand?.brand_primary || CLAIMONDO_FLAT_THEME.primary,
      accent: form.brand_accent_override || svBrand?.brand_accent || CLAIMONDO_FLAT_THEME.accent,
      text: form.brand_secondary_override || CLAIMONDO_FLAT_THEME.text,
      logoUrl: form.brand_logo_url_override || defaultLogo,
      brandedByClaimondo: false,
    }
  }
  return { ...CLAIMONDO_FLAT_THEME, logoUrl: defaultLogo, brandedByClaimondo: true }
}

/** Client-seitige Step-Validierung (nur Pflichtfelder; UNIQUE-slug erst Server). */
export function validateBasis(form: EmbedSiteFormData): Set<string> {
  const f = new Set<string>()
  if (!form.name.trim()) f.add('name')
  if (!isValidSlug(form.slug.trim())) f.add('slug')
  if (!isValidEmail(form.empfaenger_email.trim())) f.add('empfaenger_email')
  if (form.cc_email.trim() && !isValidEmail(form.cc_email.trim())) f.add('cc_email')
  if (form.erlaubte_domains.length === 0) f.add('erlaubte_domains')
  return f
}

export function validateVariante(form: EmbedSiteFormData): Set<string> {
  const f = new Set<string>()
  if (form.variante === 'B' && !form.agb_akzeptiert) f.add('agb_akzeptiert')
  return f
}

export function emptyEmbedSiteForm(): EmbedSiteFormData {
  return {
    name: '',
    slug: '',
    variante: 'A',
    erlaubte_domains: [],
    empfaenger_email: 'info@claimondo.de',
    cc_email: '',
    brand_primary_override: '',
    brand_secondary_override: '',
    brand_accent_override: '',
    brand_logo_url_override: '',
    agb_akzeptiert: false,
  }
}
