// AAR-branding-rest (2026-05-12): Branding-Resolver für Magic-Link-Token-Routen
// + Email-Branding.
//
// Gleiche Business-Rule wie resolveKundenTheme (siehe kunden-theme.ts): der
// Kunde sieht das Branding seines zugewiesenen SVs — aber nur wenn der SV
// verifiziert ist UND use_custom_branding aktiv hat. Sonst Claimondo-Default
// (Anti-Versuchskaninchen-Gate).
//
// Token-Strecken:
//   /upload/dokumente/[token] → dokument_upload_anfragen.token → lead_id → Fall → sv_id
//   /upload/zb1/[token]       → leads.zb1_token              → lead_id → Fall → sv_id
//   /flow/[token]             → flow_links.token             → lead_id → Fall → sv_id

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLAIMONDO_DEFAULT_THEME, hydrateTheme } from './theme'
import type { KundenThemeResult } from './kunden-theme'
import { kundenBrandingErlaubt } from './gate'
import { istBrandingBezahlt } from './bezahl-status'

const FALLBACK: KundenThemeResult = {
  theme: CLAIMONDO_DEFAULT_THEME,
  logoUrl: null,
  firmenname: null,
  useBrand: false,
}

async function resolveBrandingFromSvId(db: SupabaseClient, svId: string): Promise<KundenThemeResult> {
  const { data: sv } = await db
    .from('sachverstaendige')
    .select('verifiziert, use_custom_branding, brand_theme, brand_primary, brand_secondary, logo_url, firmenname')
    .eq('id', svId)
    .maybeSingle()
  if (!sv) return FALLBACK
  if (!kundenBrandingErlaubt(sv)) return FALLBACK
  // Paid-Perk (Aaron 03.08.): Wirkung nur fuer zahlende SVs — zentraler Funnel
  // fuer ALLE Token-/Email-Resolver dieses Files. Fail-closed -> Claimondo.
  if (!(await istBrandingBezahlt(svId))) return FALLBACK
  if (!sv.brand_primary && !sv.brand_theme) return FALLBACK

  return {
    theme: hydrateTheme(
      sv.brand_theme as Parameters<typeof hydrateTheme>[0],
      (sv.brand_primary as string | null) ?? null,
      (sv.brand_secondary as string | null) ?? null,
    ),
    logoUrl: (sv.logo_url as string | null) ?? null,
    firmenname: (sv.firmenname as string | null) ?? null,
    useBrand: true,
  }
}

async function resolveBrandingFromLeadId(db: SupabaseClient, leadId: string): Promise<KundenThemeResult> {
  // CMM-65: created_at lebt auf claims (SSoT). supabase-js kann nicht nach eingebetteter
  // to-one-Spalte ordnen -> claims.created_at flachziehen + clientseitig neuesten picken.
  // CMM-49 (faelle-Drop-Runway): claims-direkt statt .from('faelle'). Nur sv_id gebraucht.
  // lead_id==claims.lead_id (div=0), sv_id 0-diff, created_at claims-nativ.
  const { data: leadClaims } = await db
    .from('claims')
    .select('sv_id, created_at')
    .eq('lead_id', leadId)
    .not('sv_id', 'is', null)
  const fall = (leadClaims ?? [])
    .map((c) => ({ sv_id: c.sv_id as string | null, _c: (c.created_at as string | null) ?? '' }))
    .sort((a, b) => b._c.localeCompare(a._c))[0] ?? null
  if (!fall?.sv_id) return FALLBACK
  return resolveBrandingFromSvId(db, fall.sv_id as string)
}

/**
 * Resolved SV-Branding aus einem dokument_upload_anfragen-Token (Magic-Link).
 * Liefert immer ein verwendbares Theme — Claimondo-Default wenn kein/unverified
 * SV. Caller wrappt seine Page in <div style={generateCssVars(result.theme, 'full')}>.
 */
export async function resolveBrandingFromUploadToken(token: string): Promise<KundenThemeResult> {
  if (!token || token.length < 16) return FALLBACK
  const db = createAdminClient()
  const { data: anfrage } = await db
    .from('dokument_upload_anfragen')
    .select('lead_id')
    .eq('token', token)
    .maybeSingle()
  if (!anfrage?.lead_id) return FALLBACK
  return resolveBrandingFromLeadId(db, anfrage.lead_id as string)
}

/** Branding aus einem ZB1-Upload-Token (leads.zb1_token). */
export async function resolveBrandingFromZb1Token(token: string): Promise<KundenThemeResult> {
  if (!token || token.length < 16) return FALLBACK
  const db = createAdminClient()
  const { data: lead } = await db
    .from('leads')
    .select('id')
    .eq('zb1_token', token)
    .maybeSingle()
  if (!lead?.id) return FALLBACK
  return resolveBrandingFromLeadId(db, lead.id as string)
}

/** Branding aus einem FlowLink-Token (flow_links.token). */
export async function resolveBrandingFromFlowToken(token: string): Promise<KundenThemeResult> {
  if (!token || token.length < 16) return FALLBACK
  const db = createAdminClient()
  const { data: fl } = await db
    .from('flow_links')
    .select('lead_id')
    .eq('token', token)
    .maybeSingle()
  if (!fl?.lead_id) return FALLBACK
  return resolveBrandingFromLeadId(db, fl.lead_id as string)
}

// ── Email-Branding ──────────────────────────────────────────────────────────
// Schlankerer Shape für die Email-Templates (react-email): nur die Werte die
// EmailLayout/Heading/Button brauchen. null = kein Brand greift → Claimondo.

export type EmailBrand = {
  primary: string
  secondary: string
  logoUrl: string | null
  firmenname: string | null
}

function toEmailBrand(r: KundenThemeResult): EmailBrand | null {
  if (!r.useBrand) return null
  return {
    primary: r.theme.primary,
    secondary: r.theme.secondary,
    logoUrl: r.logoUrl,
    firmenname: r.firmenname,
  }
}

/**
 * Email-Branding für eine Kunden-gerichtete Mail. Übergib genau eine Quelle:
 *  - svId   → direkt der SV (z.B. Termin-Bestätigung)
 *  - fallId → SV aus dem Fall
 *  - leadId → SV aus dem neuesten Fall des Leads (z.B. Lead-Reminder)
 * Liefert `null` wenn kein verifizierter, branded SV greift → Caller rendert Claimondo.
 */
export async function resolveEmailBranding(
  opts: { svId?: string | null; fallId?: string | null; leadId?: string | null },
): Promise<EmailBrand | null> {
  const db = createAdminClient()
  if (opts.svId) return toEmailBrand(await resolveBrandingFromSvId(db, opts.svId))
  if (opts.leadId) return toEmailBrand(await resolveBrandingFromLeadId(db, opts.leadId))
  if (opts.fallId) {
    // CMM-49 (faelle-Drop-Runway): sv_id via Bridge->claims statt .from('faelle'). sv_id 0-diff.
    const { data: bridgeRow } = await db
      .from('faelle_claim_bridge')
      .select('claims:claims!fk_bridge_claim(sv_id)')
      .eq('fall_id', opts.fallId)
      .maybeSingle()
    const cRaw = (bridgeRow as { claims?: unknown } | null)?.claims
    const svId = ((Array.isArray(cRaw) ? cRaw[0] : cRaw) as { sv_id?: string | null } | null | undefined)?.sv_id ?? null
    if (!svId) return null
    return toEmailBrand(await resolveBrandingFromSvId(db, svId))
  }
  return null
}
