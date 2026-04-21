// AAR-92: Maik-Provisionen Admin-UI
import { createClient } from '@/lib/supabase/server'
import ProvisionenClient from './ProvisionenClient'

export const dynamic = 'force-dynamic'

export default async function ProvisionenMaikPage({ searchParams }: {
  searchParams: Promise<{ monat?: string }>
}) {
  const { monat } = await searchParams
  const aktMonat = monat ?? new Date().toISOString().slice(0, 7)

  const db = await createClient()

  const { data: provisionen } = await db
    .from('provisionen_maik')
    .select('id, lead_id, monat, basis_provision, cpl_actual, netto_provision, status, source_channel, reversed_grund, created_at, paid_at, leads(vorname, nachname, source_channel)')
    .eq('monat', aktMonat)
    .order('created_at', { ascending: false })

  // KPIs
  const total = provisionen?.length ?? 0
  const pending = provisionen?.filter(p => p.status === 'pending').length ?? 0
  const confirmed = provisionen?.filter(p => p.status === 'confirmed').length ?? 0
  const sumPending = (provisionen ?? []).filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.netto_provision ?? 0), 0)
  const sumConfirmed = (provisionen ?? []).filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.netto_provision ?? 0), 0)

  // Letzte 6 Monate fuer Filter
  const months: string[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    months.push(d.toISOString().slice(0, 7))
  }

  return (
    <ProvisionenClient
      provisionen={(provisionen ?? []) as Parameters<typeof ProvisionenClient>[0]['provisionen']}
      monat={aktMonat}
      months={months}
      kpi={{ total, pending, confirmed, sumPending, sumConfirmed }}
    />
  )
}
