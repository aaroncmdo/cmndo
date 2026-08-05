// P1 (Detail-View-Konsistenz): Detail-Facade fuer Embed-Sites.
// Konvention: docs/superpowers/detail-view-recipe.md
//
// Warum: die Admin-Liste zeigt 6 von 35 Spalten. Unsichtbar sind ausgerechnet
// die operativ wichtigen — der Lead-Preis (einzelpreis_eur), das Rate-Limit,
// die Domain-Allowlist und die Webhook-Health (last_status/last_error/last_at).

import { createClient } from '@/lib/supabase/server'

const EMBED_COLUMNS =
  'id, name, slug, variante, aktiv, funnel_modus, paused_grund, sv_id, inhaber_profile_id, ' +
  'sv_telefon, empfaenger_email, cc_email, baileys_routing_nummer, erlaubte_domains, ' +
  'max_anfragen_pro_h, einzelpreis_eur, anfragen_gesamt, letzte_anfrage_am, agb_akzeptiert_am, ' +
  'agb_version, tracking_webhook_url, tracking_webhook_secret, tracking_webhook_last_status, ' +
  'tracking_webhook_last_error, tracking_webhook_last_at, tracking_ga4_measurement_id, ' +
  'tracking_gads_conversion_id, tracking_gads_conversion_label, tracking_gads_customer_id, ' +
  'erstellt_am, updated_at, config_hits, letzter_config_hit_am, letzter_config_origin'

export type EmbedSiteDetail = {
  id: string
  name: string
  slug: string
  variante: string
  aktiv: boolean
  funnelModus: string
  pausedGrund: string | null
  svId: string | null
  inhaberProfileId: string
  svTelefon: string | null
  empfaengerEmail: string
  ccEmail: string | null
  baileysRoutingNummer: string
  erlaubteDomains: string[]
  // Abrechnung / Limits — in der Liste unsichtbar
  maxAnfragenProH: number
  einzelpreisEur: number
  anfragenGesamt: number
  letzteAnfrageAm: string | null
  // Impression-Telemetrie: Config-Loads des Monika-Widgets (eingebaut? wo?)
  configHits: number
  letzterConfigHitAm: string | null
  letzterConfigOrigin: string | null
  agbAkzeptiertAm: string | null
  agbVersion: string | null
  // Tracking / Webhook-Health — in der Liste unsichtbar
  trackingWebhookUrl: string | null
  /** Nur ob ein Secret gesetzt ist — der Wert selbst wird NIE ins UI gereicht. */
  hatWebhookSecret: boolean
  webhookLastStatus: string | null
  webhookLastError: string | null
  webhookLastAt: string | null
  ga4MeasurementId: string | null
  gadsConversionId: string | null
  gadsConversionLabel: string | null
  gadsCustomerId: string | null
  erstelltAm: string
  updatedAt: string
}

type EmbedRow = {
  id: string
  name: string
  slug: string
  variante: string
  aktiv: boolean
  funnel_modus: string
  paused_grund: string | null
  sv_id: string | null
  inhaber_profile_id: string
  sv_telefon: string | null
  empfaenger_email: string
  cc_email: string | null
  baileys_routing_nummer: string
  erlaubte_domains: string[] | null
  max_anfragen_pro_h: number
  einzelpreis_eur: number
  anfragen_gesamt: number
  letzte_anfrage_am: string | null
  config_hits: number | null
  letzter_config_hit_am: string | null
  letzter_config_origin: string | null
  agb_akzeptiert_am: string | null
  agb_version: string | null
  tracking_webhook_url: string | null
  tracking_webhook_secret: string | null
  tracking_webhook_last_status: string | null
  tracking_webhook_last_error: string | null
  tracking_webhook_last_at: string | null
  tracking_ga4_measurement_id: string | null
  tracking_gads_conversion_id: string | null
  tracking_gads_conversion_label: string | null
  tracking_gads_customer_id: string | null
  erstellt_am: string
  updated_at: string
}

export async function getEmbedSiteDetail(
  id: string,
): Promise<{ ok: true; data: EmbedSiteDetail } | { ok: false; error: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('embed_sites')
    .select(EMBED_COLUMNS)
    .eq('id', id)
    .single()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Embed-Site nicht gefunden.' }

  const e = data as unknown as EmbedRow
  return {
    ok: true,
    data: {
      id: e.id,
      name: e.name,
      slug: e.slug,
      variante: e.variante,
      aktiv: e.aktiv,
      funnelModus: e.funnel_modus,
      pausedGrund: e.paused_grund,
      svId: e.sv_id,
      inhaberProfileId: e.inhaber_profile_id,
      svTelefon: e.sv_telefon,
      empfaengerEmail: e.empfaenger_email,
      ccEmail: e.cc_email,
      baileysRoutingNummer: e.baileys_routing_nummer,
      erlaubteDomains: e.erlaubte_domains ?? [],
      maxAnfragenProH: e.max_anfragen_pro_h,
      einzelpreisEur: e.einzelpreis_eur,
      anfragenGesamt: e.anfragen_gesamt,
      letzteAnfrageAm: e.letzte_anfrage_am,
      configHits: e.config_hits ?? 0,
      letzterConfigHitAm: e.letzter_config_hit_am,
      letzterConfigOrigin: e.letzter_config_origin,
      agbAkzeptiertAm: e.agb_akzeptiert_am,
      agbVersion: e.agb_version,
      trackingWebhookUrl: e.tracking_webhook_url,
      // Secret NIE ausliefern — nur die Existenz.
      hatWebhookSecret: Boolean(e.tracking_webhook_secret),
      webhookLastStatus: e.tracking_webhook_last_status,
      webhookLastError: e.tracking_webhook_last_error,
      webhookLastAt: e.tracking_webhook_last_at,
      ga4MeasurementId: e.tracking_ga4_measurement_id,
      gadsConversionId: e.tracking_gads_conversion_id,
      gadsConversionLabel: e.tracking_gads_conversion_label,
      gadsCustomerId: e.tracking_gads_customer_id,
      erstelltAm: e.erstellt_am,
      updatedAt: e.updated_at,
    },
  }
}
