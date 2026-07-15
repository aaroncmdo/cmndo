// AAR-528 / Portal-Header P1: Finanzen-Hub als Client-State-Tabs (kein Route-Wechsel).
// Der Server-Parent laedt nur die Header-Stats + reicht die 8 server-gerenderten
// Sub-Views als Slots in die FinanceHubShell (Client). Die eckige Route-Tab-Leiste
// (FinanceHubTabs, layout.tsx) ist entfallen; die Tabs leben jetzt IN der Header-Card.
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import FinanceHubShell from './FinanceHubShell'
import UebersichtView, { ladeFinanceHeaderStats } from './_views/UebersichtView'
import AbrechnungenView from './_views/AbrechnungenView'
import SaeumigeSvsView from './_views/SaeumigeSvsView'
import OffeneFaelleView from './_views/OffeneFaelleView'
import PerSvBalanceView from './_views/PerSvBalanceView'
import KanzleiView from './_views/KanzleiView'
import ProvisionenView from './_views/ProvisionenView'
import PartnerAbrechnungenView from './_views/PartnerAbrechnungenView'

export const dynamic = 'force-dynamic'

const TAB_IDS = [
  'uebersicht', 'abrechnungen', 'saeumige-svs', 'offene-faelle',
  'per-sv-balance', 'kanzlei', 'provisionen', 'partner-abrechnungen',
] as const

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  // Deep-Link / Redirect-Stub-Einstieg: ?tab= bestimmt den Start-Tab (Client-Switch danach).
  const { tab } = await searchParams
  const initialTab = (TAB_IDS as readonly string[]).includes(tab ?? '') ? (tab as string) : 'uebersicht'

  const { mrr, svCount, mandateMonat } = await ladeFinanceHeaderStats()
  const eur = (v: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
  // Jede View streamt in ihrer eigenen Suspense-Grenze — sonst blockt der langsamste
  // der 8 eager-gerenderten Views den First-Paint des ganzen Hubs.
  const view = (node: React.ReactNode) => (
    <Suspense fallback={<LoadingSkeleton variant="block" />}>{node}</Suspense>
  )

  return (
    <FinanceHubShell
      defaultTab="uebersicht"
      initialTab={initialTab}
      title="Finanzen"
      description="Umsatz, Provision & Kennzahlen"
      actions={
        <div className="flex items-center gap-2 text-[10px] font-medium">
          <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">
            MRR {eur(mrr)}
          </span>
          <span className="bg-claimondo-ondo/5 text-claimondo-ondo px-2 py-0.5 rounded-full">
            {svCount} SVs
          </span>
          {mandateMonat > 0 && (
            <span className="bg-claimondo-ondo/[0.06] text-claimondo-navy px-2 py-0.5 rounded-full">
              {mandateMonat} Mandate
            </span>
          )}
        </div>
      }
      tabs={[
        { id: 'uebersicht', label: 'Übersicht' },
        { id: 'abrechnungen', label: 'Abrechnungen' },
        { id: 'saeumige-svs', label: 'Säumige SVs' },
        { id: 'offene-faelle', label: 'Offene Berechnungen' },
        { id: 'per-sv-balance', label: 'Per-SV Balance' },
        { id: 'kanzlei', label: 'Kanzlei-Abr.' },
        { id: 'provisionen', label: 'Provisionen' },
        { id: 'partner-abrechnungen', label: 'Partner-Abr.' },
      ]}
      views={{
        uebersicht: view(<UebersichtView />),
        abrechnungen: view(<AbrechnungenView />),
        'saeumige-svs': view(<SaeumigeSvsView />),
        'offene-faelle': view(<OffeneFaelleView />),
        'per-sv-balance': view(<PerSvBalanceView />),
        kanzlei: view(<KanzleiView />),
        provisionen: view(<ProvisionenView />),
        'partner-abrechnungen': view(<PartnerAbrechnungenView />),
      }}
    />
  )
}
