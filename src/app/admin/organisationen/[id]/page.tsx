// P1 (Detail-View-Konsistenz): Organisations-Detail-View.
// Erste NEUE Detail-View nach dem Rezept (docs/superpowers/detail-view-recipe.md).
// Vorher war die Organisationen-Liste gar nicht drillbar — von ~35 Spalten zeigte
// sie 7; alles Uebrige (Branding, Abrechnung, Mitglieder) war unsichtbar.
//
// Server-Component: pro Tab werden NUR dessen Daten geladen (die Mitglieder-Query
// laeuft nur bei tab=mitglieder). Das ist der Grund fuer die <Link>-Tabs.

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { StatusBadge } from '@/components/shared/StatusBadge'
import EntityDetailShell, { type DetailTab } from '@/components/shared/detail/EntityDetailShell'
import { getOrganisationDetail, getOrganisationMitglieder } from '@/lib/organisationen/queries'
import { orgOnboardingBadge } from '@/lib/organisationen/onboarding-status'
import StammdatenTab from './_tabs/StammdatenTab'
import MitgliederTab from './_tabs/MitgliederTab'
import BrandingTab from './_tabs/BrandingTab'

export const dynamic = 'force-dynamic'

type OrgSearchParams = { tab?: string }

export default async function OrganisationDetailPage({
  params,
  searchParams,
  variant = 'page',
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<OrgSearchParams>
  /**
   * "drawer" wenn die Intercepting-Route diese Page im DrawerShell rendert.
   * Next uebergibt der echten Route nur params/searchParams -> Default "page".
   */
  variant?: 'page' | 'drawer'
}) {
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const activeTab =
    sp.tab === 'mitglieder' ? 'mitglieder' : sp.tab === 'branding' ? 'branding' : 'stammdaten'

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

  const res = await getOrganisationDetail(id)
  if (!res.ok) notFound()
  const org = res.data

  // Nur die Daten des AKTIVEN Tabs laden.
  const mitglieder = activeTab === 'mitglieder' ? await getOrganisationMitglieder(id) : []

  // Dieselbe Quelle wie die Liste — sonst zeigt das Detail einen anderen
  // Status-Text/-Farbe als die Zeile, aus der man gerade geklickt hat.
  const statusBadge = orgOnboardingBadge(org.onboardingStatus)

  const base = `/admin/organisationen/${id}`
  const tabs: DetailTab[] = [
    { key: 'stammdaten', label: 'Stammdaten', href: base },
    { key: 'mitglieder', label: 'Mitglieder', href: `${base}?tab=mitglieder` },
    { key: 'branding', label: 'Branding', href: `${base}?tab=branding` },
  ]

  return (
    <EntityDetailShell
      variant={variant}
      title={org.name}
      backHref="/admin/organisationen"
      backLabel="Organisationen"
      tabs={tabs}
      activeTab={activeTab}
      description={
        <span className="flex items-center gap-2 flex-wrap">
          <StatusBadge colorCls="bg-claimondo-bg text-claimondo-ondo">
            {org.typ === 'akademie' ? 'Akademie' : org.typ === 'buero' ? 'Büro' : (org.typ ?? '—')}
          </StatusBadge>
          <StatusBadge colorCls={statusBadge.colorCls}>
            <statusBadge.Icon className="w-3 h-3" /> {statusBadge.label}
          </StatusBadge>
          {org.verwalter?.email && (
            <span className="text-claimondo-ondo/70">{org.verwalter.email}</span>
          )}
        </span>
      }
    >
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'mitglieder' ? (
            <MitgliederTab mitglieder={mitglieder} />
          ) : activeTab === 'branding' ? (
            <BrandingTab org={org} />
          ) : (
            <StammdatenTab org={org} />
          )}
        </div>
      </div>
    </EntityDetailShell>
  )
}
