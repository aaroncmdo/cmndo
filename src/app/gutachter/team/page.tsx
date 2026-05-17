import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getGutachterForUser } from '@/lib/gutachter'
import { Building2Icon, GraduationCapIcon } from 'lucide-react'
import TeamClient from './TeamClient'

// KFZ-152 Phase 2+3: Team-Verwaltung fuer Buero-Inhaber und Akademie-Verwalter.
// Zeigt alle Sub-SVs der eigenen Org + die Pool-Leads die noch nicht zugewiesen
// wurden (organisation_id=org AND sv_id IS NULL). Verwalter kann Pool-Leads
// manuell zuweisen UND Mitarbeiter sperren/entsperren.

export const dynamic = 'force-dynamic'

// Type-Imports vom Client-Component (nicht lokal definieren um Drift zu vermeiden)
import type { SubSvData, PoolLeadData } from './TeamClient'

export default async function TeamPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{
    id: string
    organisation_id: string | null
    rolle_in_organisation: string | null
    ist_parent_account: boolean
  }>(supabase, user.id, 'id, organisation_id, rolle_in_organisation, ist_parent_account')

  if (!sv?.organisation_id) {
    redirect('/gutachter?error=Du+gehoerst+keiner+Organisation')
  }

  // Org-Stammdaten + Berechtigungs-Check
  const { data: org } = await supabase
    .from('organisationen')
    .select('id, name, typ, hauptansprechpartner_user_id')
    .eq('id', sv.organisation_id)
    .single()

  if (!org) redirect('/gutachter?error=Organisation+nicht+gefunden')

  const isVerwalter = org.hauptansprechpartner_user_id === user.id || sv.ist_parent_account
  if (!isVerwalter) {
    redirect('/gutachter?error=Nur+Inhaber+oder+Verwalter+haben+Zugriff')
  }

  // Sub-SVs der Org laden
  const { data: subRows } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, paket, rolle_in_organisation, ist_aktiv, portal_zugang_freigeschaltet, paket_faelle_gesamt, paket_faelle_genutzt, werbebudget_guthaben_netto')
    .eq('organisation_id', sv.organisation_id)
    .neq('id', sv.id) // Verwalter selbst raus

  // Profile-Lookup
  const profileIds = (subRows ?? []).map(s => s.profile_id).filter(Boolean) as string[]
  const profileMap = new Map<string, { vorname: string | null; nachname: string | null; email: string | null }>()
  if (profileIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, vorname, nachname, email')
      .in('id', profileIds)
    for (const p of profs ?? []) profileMap.set(p.id, p)
  }

  // KFZ-152 Erweiterung: gesperrt_seit fuer den Sperre-Toggle
  const { data: subRowsExt } = await supabase
    .from('sachverstaendige')
    .select('id, gesperrt_seit')
    .eq('organisation_id', sv.organisation_id)
  const sperreMap = new Map<string, string | null>()
  for (const r of subRowsExt ?? []) sperreMap.set(r.id, (r.gesperrt_seit as string | null) ?? null)

  const subSvs: SubSvData[] = (subRows ?? []).map(s => ({
    id: s.id,
    paket: s.paket ?? 'standard',
    rolle_in_organisation: s.rolle_in_organisation,
    ist_aktiv: !!s.ist_aktiv,
    portal_zugang_freigeschaltet: !!s.portal_zugang_freigeschaltet,
    gesperrt_seit: sperreMap.get(s.id) ?? null,
    paket_faelle_gesamt: s.paket_faelle_gesamt ?? 0,
    paket_faelle_genutzt: s.paket_faelle_genutzt,
    werbebudget_guthaben_netto: s.werbebudget_guthaben_netto != null ? Number(s.werbebudget_guthaben_netto) : null,
    vorname: s.profile_id ? profileMap.get(s.profile_id)?.vorname ?? null : null,
    nachname: s.profile_id ? profileMap.get(s.profile_id)?.nachname ?? null : null,
    email: s.profile_id ? profileMap.get(s.profile_id)?.email ?? null : null,
  }))

  // KFZ-152 Phase 2+3: Pool-Leads laden (Faelle die an die Org geroutet wurden,
  // aber noch keinem konkreten Sub-SV zugewiesen sind)
  // CMM-44 SP-A: spezifikation ist eine faelle<->claims-Duplikat-Spalte
  // → aus dem claims-Embed lesen (SSoT); restliche Felder bleiben faelle-only.
  // CMM-44 SP-A2 (Cluster 1): schadenort_* ebenfalls aus dem claims-Embed.
  // CMM-44 SP-A2 (Cluster 2): schadens_art → claims.schadenart — claims-Embed.
  const { data: poolFaelle } = await supabase
    .from('faelle')
    .select('id, status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, created_at, claims:claim_id(spezifikation, schadenort_plz, schadenort_ort, schadenort_adresse, schadenart, claim_nummer)')
    .eq('organisation_id', sv.organisation_id)
    .is('sv_id', null)
    .order('created_at', { ascending: false })
    .limit(50)

  const poolLeads: PoolLeadData[] = (poolFaelle ?? []).map(f => {
    const fClaim = Array.isArray(f.claims) ? f.claims[0] : f.claims
    return {
      id: f.id as string,
      claim_nummer: (fClaim?.claim_nummer as string | null) ?? f.id.slice(0, 8),
      status: (f.status as string) ?? 'ersterfassung',
      schadens_plz: (fClaim?.schadenort_plz as string | null) ?? null,
      schadens_ort: (fClaim?.schadenort_ort as string | null) ?? null,
      schadens_adresse: (fClaim?.schadenort_adresse as string | null) ?? null,
      kennzeichen: (f.kennzeichen as string) ?? null,
      fahrzeug: [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || null,
      spezifikation: (fClaim?.spezifikation as string) ?? null,
      // CMM-44 SP-A2 (Cluster 2): aus claims.schadenart. Property-Name
      // schadens_art bleibt als Vertrag fuer PoolLeadData/TeamClient.
      schadens_art: (fClaim?.schadenart as string) ?? null,
      created_at: (f.created_at as string) ?? null,
    }
  })

  const Icon = org.typ === 'akademie' ? GraduationCapIcon : Building2Icon
  const orgLabel = org.typ === 'akademie' ? 'Akademie' : 'Büro'
  // Nur in Org-Pool-Modellen (Akademie) hat Verwalter Pool-Leads zur Verteilung.
  // Buero verteilt direkt an Sub-Standorte beim Dispatch.
  const showPoolSection = org.typ === 'akademie'

  // KFZ-152 Follow-up: Aggregierte Stats fuer den Verwalter
  const aktiveCount = subSvs.filter(s => s.ist_aktiv && !s.gesperrt_seit).length
  const gesperrtCount = subSvs.filter(s => !!s.gesperrt_seit).length
  const totalFaelleGenutzt = subSvs.reduce((sum, s) => sum + (s.paket_faelle_genutzt ?? 0), 0)
  const totalFaelleMax = subSvs.reduce((sum, s) => sum + s.paket_faelle_gesamt, 0)
  const totalWerbebudget = subSvs.reduce((sum, s) => sum + (s.werbebudget_guthaben_netto ?? 0), 0)
  const auslastungPct = totalFaelleMax > 0 ? Math.round((totalFaelleGenutzt / totalFaelleMax) * 100) : 0

  const stats = {
    mitglieder_gesamt: subSvs.length,
    mitglieder_aktiv: aktiveCount,
    mitglieder_gesperrt: gesperrtCount,
    faelle_genutzt: totalFaelleGenutzt,
    faelle_max: totalFaelleMax,
    auslastung_pct: auslastungPct,
    werbebudget_gesamt: totalWerbebudget,
    pool_leads: poolLeads.length,
  }

  // Icon wird im Client-Component anhand iconKey gewaehlt
  void Icon
  return (
    <TeamClient
      orgName={org.name}
      orgLabel={orgLabel}
      iconKey={org.typ === 'akademie' ? 'akademie' : 'buero'}
      subSvs={subSvs}
      poolLeads={poolLeads}
      showPoolSection={showPoolSection}
      stats={stats}
    />
  )
}
