// P1 (Detail-View-Konsistenz): Versicherer-Detail-View.
// Ersetzt das 512px-Modal. Die Liste zeigte 5 von 15 Spalten; das eigentlich
// Interessante an einem Versicherer ist aber das, was auf ihn ZEIGT — Faelle
// (claims.gegner_versicherung_id) und die VS-Korrespondenz. Beides war bisher
// nirgends gebuendelt erreichbar.
//
// Server-Component: pro Tab werden NUR dessen Daten geladen.

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { StatusBadge } from '@/components/shared/StatusBadge'
import EntityDetailShell, { type DetailTab } from '@/components/shared/detail/EntityDetailShell'
import {
  getVersichererDetail,
  getVersichererFaelle,
  getVersichererKorrespondenz,
} from '@/lib/versicherungen/queries'
import StammdatenTab from './_tabs/StammdatenTab'
import FaelleTab from './_tabs/FaelleTab'
import KorrespondenzTab from './_tabs/KorrespondenzTab'

export const dynamic = 'force-dynamic'

type VsSearchParams = { tab?: string }

// Full-Page-only: der Drawer-Intercept wurde entfernt (die Liste lebt seit der
// Partner-Hub-Konsolidierung cross-segment unter /admin/partner/versicherer ->
// der Intercept konnte nie feuern). Daher kein `variant`-Prop mehr.
export default async function VersichererDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<VsSearchParams>
}) {
  const { id } = await params
  const sp = (await searchParams) ?? {}
  const activeTab =
    sp.tab === 'faelle' ? 'faelle' : sp.tab === 'korrespondenz' ? 'korrespondenz' : 'stammdaten'

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

  const res = await getVersichererDetail(id)
  if (!res.ok) notFound()
  const versicherer = res.data

  // Nur die Daten des AKTIVEN Tabs laden.
  const faelle = activeTab === 'faelle' ? await getVersichererFaelle(id) : []
  const korrespondenz =
    activeTab === 'korrespondenz' ? await getVersichererKorrespondenz(id) : []

  const base = `/admin/versicherungen/${id}`
  const tabs: DetailTab[] = [
    { key: 'stammdaten', label: 'Stammdaten', href: base },
    { key: 'faelle', label: 'Fälle', href: `${base}?tab=faelle` },
    { key: 'korrespondenz', label: 'Korrespondenz', href: `${base}?tab=korrespondenz` },
  ]

  return (
    <EntityDetailShell
      title={versicherer.name}
      backHref="/admin/versicherungen"
      backLabel="Versicherer"
      tabs={tabs}
      activeTab={activeTab}
      description={
        <span className="flex items-center gap-2 flex-wrap">
          <StatusBadge
            colorCls={
              versicherer.istAktiv
                ? 'bg-success-soft text-success-strong'
                : 'bg-danger-soft text-danger-strong'
            }
          >
            {versicherer.istAktiv ? 'Aktiv' : 'Deaktiviert'}
          </StatusBadge>
          {versicherer.stadt && (
            <span className="text-claimondo-ondo/70">{versicherer.stadt}</span>
          )}
          {versicherer.bafinNummer && (
            <span className="text-claimondo-ondo/70">BaFin {versicherer.bafinNummer}</span>
          )}
        </span>
      }
    >
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'faelle' ? (
            <FaelleTab faelle={faelle} />
          ) : activeTab === 'korrespondenz' ? (
            <KorrespondenzTab korrespondenz={korrespondenz} />
          ) : (
            <StammdatenTab versicherer={versicherer} />
          )}
        </div>
      </div>
    </EntityDetailShell>
  )
}
