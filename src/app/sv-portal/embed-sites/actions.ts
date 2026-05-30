'use server'

// AAR-939 · Monika-Embed · Stream 6 — Embed-Site Server-Actions.
//
// Alle Writes laufen via createAdminClient (service_role → RLS-Bypass), weil
// embed_sites KEINE authenticated-INSERT/UPDATE/DELETE-Policy hat (default-deny).
// Deshalb MUSS jede Action serverseitig:
//   • inhaber_profile_id = user.id setzen (nie aus Client),
//   • bei Update/Toggle WHERE inhaber_profile_id = user.id filtern (IDOR-Schutz),
//   • variante/einzelpreis_eur/agb_* serverseitig kontrollieren (Mass-Assignment).
// einzelpreis_eur wird NIE aus dem Client uebernommen (DB-Default 70.00).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { extractHost } from '@/lib/embed/anfrage'
import {
  type EmbedSiteFormData,
  MONIKA_AGB_VERSION,
  isValidSlug,
  isValidEmail,
} from '@/lib/embed/site-write'

type ActionResult = { ok: boolean; error?: string; id?: string }

/** Zentrale Claimondo-WhatsApp-Nummer (Aaron 30.05.: alles laeuft ueber EINE Nummer). */
function claimondoRoutingNummer(): string {
  return process.env.KFZ_LP_BAILEYS_TARGET ?? process.env.MONIKA_WA_NUMMER ?? ''
}

function orNull(value: string): string | null {
  const t = value.trim()
  return t.length ? t : null
}

function normalizeDomains(raw: string[]): string[] {
  const hosts = raw.map((d) => extractHost(d)).filter((d): d is string => !!d)
  return Array.from(new Set(hosts))
}

/** Validiert die Pflichtfelder serverseitig (Client-Validierung ist nur UX). */
function validateForm(form: EmbedSiteFormData): string | null {
  if (!form.name.trim()) return 'Name fehlt.'
  if (!isValidSlug(form.slug.trim())) return 'Ungültiger Slug (a–z, 0–9, Bindestrich, 3–40 Zeichen).'
  if (!isValidEmail(form.empfaenger_email.trim())) return 'Ungültige Empfänger-Email.'
  if (form.cc_email.trim() && !isValidEmail(form.cc_email.trim())) return 'Ungültige CC-Email.'
  const domains = normalizeDomains(form.erlaubte_domains)
  if (domains.length === 0) return 'Mindestens eine erlaubte Domain angeben.'
  if (form.variante === 'B' && !form.agb_akzeptiert) return 'Für Variante B muss die Kooperations-AGB akzeptiert werden.'
  return null
}

function buildRow(form: EmbedSiteFormData, inhaberProfileId: string, svId: string | null) {
  const agb =
    form.variante === 'B' && form.agb_akzeptiert
      ? { agb_akzeptiert_am: new Date().toISOString(), agb_version: MONIKA_AGB_VERSION }
      : { agb_akzeptiert_am: null, agb_version: null }

  return {
    inhaber_profile_id: inhaberProfileId,
    sv_id: svId,
    name: form.name.trim(),
    slug: form.slug.trim().toLowerCase(),
    variante: form.variante, // server-kontrolliert (A|B), nie einzelpreis aus Client
    erlaubte_domains: normalizeDomains(form.erlaubte_domains),
    empfaenger_email: form.empfaenger_email.trim(),
    cc_email: orNull(form.cc_email),
    baileys_routing_nummer: claimondoRoutingNummer(),
    brand_primary_override: orNull(form.brand_primary_override),
    brand_secondary_override: orNull(form.brand_secondary_override),
    brand_accent_override: orNull(form.brand_accent_override),
    brand_logo_url_override: orNull(form.brand_logo_url_override),
    ...agb,
  }
}

export async function createEmbedSite(form: EmbedSiteFormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const validationError = validateForm(form)
  if (validationError) return { ok: false, error: validationError }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data, error } = await db
    .from('embed_sites')
    .insert(buildRow(form, user.id, sv?.id ?? null))
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Dieser Slug ist bereits vergeben.' }
    return { ok: false, error: error.message }
  }

  revalidatePath('/sv-portal/embed-sites')
  return { ok: true, id: data.id as string }
}

export async function updateEmbedSite(id: string, form: EmbedSiteFormData): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const validationError = validateForm(form)
  if (validationError) return { ok: false, error: validationError }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  // IDOR-Schutz: WHERE id AND inhaber_profile_id=user.id → fremde Site = 0 Rows.
  const { data, error } = await db
    .from('embed_sites')
    .update(buildRow(form, user.id, sv?.id ?? null))
    .eq('id', id)
    .eq('inhaber_profile_id', user.id)
    .select('id')

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Dieser Slug ist bereits vergeben.' }
    return { ok: false, error: error.message }
  }
  if (!data || data.length === 0) return { ok: false, error: 'Site nicht gefunden.' }

  revalidatePath('/sv-portal/embed-sites')
  revalidatePath(`/sv-portal/embed-sites/${id}`)
  return { ok: true, id }
}

export async function toggleEmbedSiteAktiv(id: string, aktiv: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data, error } = await db
    .from('embed_sites')
    .update({ aktiv })
    .eq('id', id)
    .eq('inhaber_profile_id', user.id)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Site nicht gefunden.' }

  revalidatePath('/sv-portal/embed-sites')
  return { ok: true, id }
}
