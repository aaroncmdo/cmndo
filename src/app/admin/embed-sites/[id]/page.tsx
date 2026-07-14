// P1 (Detail-View-Konsistenz): Embed-Site-Detail-View (Admin-Linse).
// Die Liste zeigte 6 von 35 Spalten — unsichtbar waren ausgerechnet Lead-Preis,
// Rate-Limit, Domain-Allowlist und Webhook-Health.
//
// Bewusst READ + Admin-Aktionen, KEIN Rebuild des SV-Wizards: der SV pflegt seine
// eigene Site bereits unter /gutachter/einstellungen/embed/[id].

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { StatusBadge } from '@/components/shared/StatusBadge'
import EntityDetailShell, { type DetailTab } from '@/components/shared/detail/EntityDetailShell'
import { getEmbedSiteDetail } from '@/lib/embed-sites/queries'
import KonfigurationTab from './_tabs/KonfigurationTab'
import TrackingTab from './_tabs/TrackingTab'

export const dynamic = 'force-dynamic'

type EmbedSearchParams = { tab?: string }

export default async function EmbedSiteDetailPage({
  params,
  searchParams,
  variant = 'page',
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<EmbedSearchParams>
  /** "drawer" wenn die Intercepting-Route diese Page im DrawerShell rendert. */
  variant?: 'page' | 'drawer'
}) {
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const activeTab = sp.tab === 'tracking' ? 'tracking' : 'konfiguration'

  // Admin-Guard (identisch zur Liste)
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  const res = await getEmbedSiteDetail(id)
  if (!res.ok) notFound()
  const site = res.data

  const base = `/admin/embed-sites/${id}`
  const tabs: DetailTab[] = [
    { key: 'konfiguration', label: 'Konfiguration', href: base },
    { key: 'tracking', label: 'Abrechnung & Tracking', href: `${base}?tab=tracking` },
  ]

  const webhookKaputt =
    Boolean(site.trackingWebhookUrl) && Boolean(site.webhookLastError)

  return (
    <EntityDetailShell
      variant={variant}
      title={site.name}
      backHref="/admin/embed-sites"
      backLabel="Embed-Sites"
      tabs={tabs}
      activeTab={activeTab}
      description={
        <span className="flex items-center gap-2 flex-wrap">
          <StatusBadge
            colorCls={
              site.aktiv
                ? 'bg-success-soft text-success-strong'
                : 'bg-danger-soft text-danger-strong'
            }
          >
            {site.aktiv ? 'Aktiv' : 'Pausiert'}
          </StatusBadge>
          <span className="font-mono text-claimondo-ondo/70">/{site.slug}</span>
          <span className="text-claimondo-ondo/70">
            {site.einzelpreisEur.toLocaleString('de-DE')} € / Lead
          </span>
          {webhookKaputt && (
            <StatusBadge colorCls="bg-danger-soft text-danger-strong">
              Webhook fehlerhaft
            </StatusBadge>
          )}
        </span>
      }
    >
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'tracking' ? (
            <TrackingTab site={site} />
          ) : (
            <KonfigurationTab site={site} />
          )}
        </div>
      </div>
    </EntityDetailShell>
  )
}
