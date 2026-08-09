// AAR-939 · Stream 6 — Embed-Site bearbeiten (Wizard edit).

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { SvPageChrome } from '@/app/gutachter/_shell/SvPageChrome'
import { type EmbedSiteFormData } from '@/lib/embed/site-write'
import EmbedSiteWizard from '../EmbedSiteWizard'
import EmbedSnippets from '../EmbedSnippets'

export const dynamic = 'force-dynamic'

export default async function EditEmbedSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // embed_sites fehlt in database.types.ts → Cast (RLS owner_select greift).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('embed_sites')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()

  const sv = user
    ? await getGutachterForUser<{ brand_primary: string | null; brand_accent: string | null; verifiziert: boolean | null }>(
        supabase,
        user.id,
        'brand_primary, brand_accent, verifiziert',
      )
    : null

  const initial: EmbedSiteFormData = {
    name: data.name ?? '',
    slug: data.slug ?? '',
    variante: data.variante === 'B' ? 'B' : 'A',
    erlaubte_domains: data.erlaubte_domains ?? [],
    empfaenger_email: data.empfaenger_email ?? 'info@claimondo.de',
    cc_email: data.cc_email ?? '',
    brand_primary_override: data.brand_primary_override ?? '',
    brand_secondary_override: data.brand_secondary_override ?? '',
    brand_accent_override: data.brand_accent_override ?? '',
    brand_logo_url_override: data.brand_logo_url_override ?? '',
    agb_akzeptiert: Boolean(data.agb_akzeptiert_am),
    tracking_webhook_url: data.tracking_webhook_url ?? '',
    tracking_ga4_measurement_id: data.tracking_ga4_measurement_id ?? '',
    tracking_gads_conversion_id: data.tracking_gads_conversion_id ?? '',
    tracking_gads_conversion_label: data.tracking_gads_conversion_label ?? '',
  }

  return (
    <div className="py-6 space-y-4">
      <SvPageChrome title="Embed-Site bearbeiten" />
      {data.slug && <EmbedSnippets slug={data.slug} />}
      <EmbedSiteWizard
        mode="edit"
        siteId={id}
        initial={initial}
        svBrand={sv ? { brand_primary: sv.brand_primary, brand_accent: sv.brand_accent } : null}
        defaultLogo="/brand/logo-mark.svg"
        svVerifiziert={!!sv?.verifiziert}
        trackingMeta={{
          hasSecret: Boolean(data.tracking_webhook_secret),
          lastStatus: data.tracking_webhook_last_status ?? null,
          lastAt: data.tracking_webhook_last_at ?? null,
          lastError: data.tracking_webhook_last_error ?? null,
        }}
      />
    </div>
  )
}
