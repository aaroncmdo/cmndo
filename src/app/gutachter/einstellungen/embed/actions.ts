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

import { randomBytes } from 'crypto'
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
  isValidWebhookUrl,
  emptyEmbedSiteForm,
  slugify,
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
  // erlaubte_domains ist optional: leer = Widget darf auf jeder Domain laufen
  // (Aaron 05.08.); der Origin-Check in anfrage-from-lp greift nur bei Eintraegen.
  if (form.variante === 'B' && !form.agb_akzeptiert) return 'Für Variante B muss die Kooperations-AGB akzeptiert werden.'
  if (!isValidWebhookUrl(form.tracking_webhook_url)) return 'Webhook-URL muss mit https:// beginnen.'
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
    tracking_webhook_url: orNull(form.tracking_webhook_url),
    tracking_ga4_measurement_id: orNull(form.tracking_ga4_measurement_id),
    tracking_gads_conversion_id: orNull(form.tracking_gads_conversion_id),
    tracking_gads_conversion_label: orNull(form.tracking_gads_conversion_label),
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

  const sv = await getGutachterForUser<{ id: string; verifiziert: boolean | null }>(
    supabase,
    user.id,
    'id, verifiziert',
  )
  // AAR-939 Part B: Variante B (kostenpflichtig, Dispatch-Qualifizierung) erst
  // nach Verifizierung durch Claimondo. Variante A bleibt jederzeit moeglich.
  if (form.variante === 'B' && !sv?.verifiziert) {
    return { ok: false, error: 'Variante B ist erst nach deiner Verifizierung durch Claimondo freigeschaltet.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const row = buildRow(form, user.id, sv?.id ?? null)
  const insertRow = form.tracking_webhook_url.trim()
    ? { ...row, tracking_webhook_secret: randomBytes(32).toString('hex') }
    : row
  const { data, error } = await db
    .from('embed_sites')
    .insert(insertRow)
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Dieser Slug ist bereits vergeben.' }
    return { ok: false, error: error.message }
  }

  revalidatePath('/gutachter/einstellungen/embed')
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

  const sv = await getGutachterForUser<{ id: string; verifiziert: boolean | null }>(
    supabase,
    user.id,
    'id, verifiziert',
  )
  // AAR-939 Part B: Wechsel auf / Speichern mit Variante B erst nach Verifizierung.
  if (form.variante === 'B' && !sv?.verifiziert) {
    return { ok: false, error: 'Variante B ist erst nach deiner Verifizierung durch Claimondo freigeschaltet.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  // Secret nur einmalig generieren (beim erstmaligen Setzen einer URL).
  let secretPatch: { tracking_webhook_secret?: string } = {}
  if (form.tracking_webhook_url.trim()) {
    const { data: existing } = await db
      .from('embed_sites')
      .select('tracking_webhook_secret')
      .eq('id', id)
      .eq('inhaber_profile_id', user.id)
      .maybeSingle()
    if (!existing?.tracking_webhook_secret) {
      secretPatch = { tracking_webhook_secret: randomBytes(32).toString('hex') }
    }
  }
  // IDOR-Schutz: WHERE id AND inhaber_profile_id=user.id → fremde Site = 0 Rows.
  const { data, error } = await db
    .from('embed_sites')
    .update({ ...buildRow(form, user.id, sv?.id ?? null), ...secretPatch })
    .eq('id', id)
    .eq('inhaber_profile_id', user.id)
    .select('id')

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Dieser Slug ist bereits vergeben.' }
    return { ok: false, error: error.message }
  }
  if (!data || data.length === 0) return { ok: false, error: 'Site nicht gefunden.' }

  revalidatePath('/gutachter/einstellungen/embed')
  revalidatePath(`/gutachter/einstellungen/embed/${id}`)
  return { ok: true, id }
}

/**
 * AAR-939 Part B2: Hosted-Widget-Site fuer SVs OHNE eigene Website. Legt ein
 * Variante-A embed_site OHNE Domain-Beschraenkung an (leer = ueberall erlaubt,
 * Aaron 05.08.) — die oeffentliche Seite /g/[slug] traegt das Monika-Widget,
 * und ein spaeterer Einbau auf der eigenen Website funktioniert sofort mit.
 */
export async function createHostedEmbedSite(
  name: string,
): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const trimmed = name.trim()
  if (trimmed.length < 2) {
    return { ok: false, error: 'Bitte gib einen Namen an — daraus wird deine Claimondo-Seite.' }
  }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  // Slug aus Name + kurzem Random-Suffix (kollisions-arm; kein Date.now noetig).
  const baseSlug = (slugify(trimmed) || 'gutachter').slice(0, 32)
  const slug = `${baseSlug}-${randomBytes(2).toString('hex')}`

  const form: EmbedSiteFormData = {
    ...emptyEmbedSiteForm(),
    name: trimmed,
    slug,
    variante: 'A',
    erlaubte_domains: [],
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data, error } = await db
    .from('embed_sites')
    .insert(buildRow(form, user.id, sv?.id ?? null))
    .select('id, slug')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Bitte erneut versuchen (Slug-Kollision).' }
    return { ok: false, error: error.message }
  }

  revalidatePath('/gutachter/einstellungen/embed')
  return { ok: true, id: data.id as string, slug: data.slug as string }
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

  revalidatePath('/gutachter/einstellungen/embed')
  return { ok: true, id }
}

/**
 * AAR-939 8b: Test-Webhook (event:'test') an die konfigurierte URL der eigenen
 * Site. 1x POST (kein Retry). Ownership ueber inhaber_profile_id. Signatur via
 * pure Kern (createHmac) — kein server-only-Import noetig.
 */
export async function sendTestTrackingWebhook(
  siteId: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: site } = await db
    .from('embed_sites')
    .select('slug, tracking_webhook_url, tracking_webhook_secret')
    .eq('id', siteId)
    .eq('inhaber_profile_id', user.id)
    .maybeSingle()
  if (!site) return { ok: false, error: 'Site nicht gefunden.' }
  if (!site.tracking_webhook_url || !site.tracking_webhook_secret) {
    return { ok: false, error: 'Keine Webhook-URL konfiguriert. Erst URL speichern.' }
  }

  const { buildTrackingPayload, signPayload, postWithRetry } = await import('@/lib/embed/tracking-webhook-core')
  const payload = buildTrackingPayload({
    event: 'test',
    gfa: {
      id: 'test',
      vorname: 'Test',
      nachname: 'Anfrage',
      gclid: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
      ga_client_id: null,
    },
    embedSiteSlug: site.slug as string,
    valueEur: null,
    ts: new Date().toISOString(),
  })
  const body = JSON.stringify(payload)
  const signature = signPayload(body, site.tracking_webhook_secret as string)
  const res = await postWithRetry(site.tracking_webhook_url as string, body, signature, { attempts: 1 })

  await db
    .from('embed_sites')
    .update({
      tracking_webhook_last_status: res.status != null ? String(res.status) : res.error ? 'error' : 'unknown',
      tracking_webhook_last_at: new Date().toISOString(),
      tracking_webhook_last_error: res.ok ? null : res.error ?? `HTTP ${res.status}`,
    })
    .eq('id', siteId)

  revalidatePath(`/gutachter/einstellungen/embed/${siteId}`)
  if (!res.ok) return { ok: false, status: res.status ?? undefined, error: res.error ?? `HTTP ${res.status}` }
  return { ok: true, status: res.status ?? undefined }
}
