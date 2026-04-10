import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OrganisationenClient from './OrganisationenClient'

// KFZ-152 Follow-up: Admin-Listing fuer alle Organisationen (Buero + Akademie).
// Communities haben eine eigene Page unter /admin/communities.

export const dynamic = 'force-dynamic'

export default async function OrganisationenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  // Alle Orgs laden (buero + akademie; community hat eigene Page)
  const { data: orgs } = await supabase
    .from('organisationen')
    .select('id, name, typ, onboarding_status, parent_stripe_customer_id, hauptansprechpartner_user_id, akademie_erst_anzahlung_eur, akademie_radius_km, community_exklusiv, community_max_faelle_monat, created_at')
    .in('typ', ['buero', 'akademie'])
    .order('created_at', { ascending: false })

  // Member-Counts pro Org via sachverstaendige
  const orgIds = (orgs ?? []).map(o => o.id)
  const memberCounts = new Map<string, number>()
  const verwalterMap = new Map<string, { vorname: string | null; nachname: string | null; email: string | null }>()

  if (orgIds.length) {
    // Count members per org
    for (const orgId of orgIds) {
      const { count } = await supabase
        .from('sachverstaendige')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
      memberCounts.set(orgId, count ?? 0)
    }

    // Verwalter-Profile laden
    const verwalterUserIds = (orgs ?? [])
      .map(o => o.hauptansprechpartner_user_id)
      .filter(Boolean) as string[]
    if (verwalterUserIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, vorname, nachname, email')
        .in('id', verwalterUserIds)
      for (const p of profs ?? []) {
        verwalterMap.set(p.id, { vorname: p.vorname, nachname: p.nachname, email: p.email })
      }
    }
  }

  const rows = (orgs ?? []).map(o => {
    const verwalter = o.hauptansprechpartner_user_id
      ? verwalterMap.get(o.hauptansprechpartner_user_id)
      : null
    return {
      id: o.id as string,
      name: o.name as string,
      typ: o.typ as string,
      onboarding_status: o.onboarding_status as string,
      has_stripe: !!o.parent_stripe_customer_id,
      member_count: memberCounts.get(o.id as string) ?? 0,
      verwalter_name: verwalter ? [verwalter.vorname, verwalter.nachname].filter(Boolean).join(' ') || null : null,
      verwalter_email: verwalter?.email ?? null,
      created_at: o.created_at as string,
    }
  })

  return <OrganisationenClient organisationen={rows} />
}
