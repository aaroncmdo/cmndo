// AAR-92: Maik-Provisionen Admin-UI
// Task-11: marketing_partner Maik-Zeile server-seitig laden, USt-Toggle an Client weitergeben.
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ProvisionenClient from './ProvisionenClient'

export const dynamic = 'force-dynamic'

export default async function ProvisionenMaikPage({ searchParams }: {
  searchParams: Promise<{ monat?: string }>
}) {
  const { monat } = await searchParams
  const aktMonat = monat ?? new Date().toISOString().slice(0, 7)

  const db = await createClient()
  // Dashboard-Audit (29.06.): Page hatte keinen Rollen-Guard (anders als die Schwester-Seiten).
  // provisionen_maik-RLS erlaubt auch kundenbetreuer/dispatch Lesezugriff -> ohne Guard koennten
  // sie die Maik-Provisionen einsehen. Admin-Gate wie bei saeumige-svs / per-sv-balance.
  const user = (await db.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await db.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/')

  const { data: provisionen } = await db
    .from('provisionen_maik')
    .select('id, lead_id, monat, basis_provision, cpl_actual, netto_provision, status, source_channel, reversed_grund, created_at, paid_at, leads(vorname, nachname, source_channel)')
    .eq('monat', aktMonat)
    .order('created_at', { ascending: false })

  // Maik-marketing_partner-Zeile fuer USt-Toggle laden (admin-Client, Spalte in Branch neu)
  const adminDb = createAdminClient()
  const { data: maikRaw } = await adminDb
    .from('marketing_partner' as never)
    .select('id, ist_kleinunternehmer')
    .limit(1)
    .single()
  const maik = maikRaw as { id: string; ist_kleinunternehmer: boolean | null } | null

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
      maik={maik ? { id: maik.id, istKleinunternehmer: maik.ist_kleinunternehmer } : null}
    />
  )
}
