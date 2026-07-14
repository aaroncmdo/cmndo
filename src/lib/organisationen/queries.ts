// P1 (Detail-View-Konsistenz): Detail-Facade fuer Organisationen.
// Konvention: docs/superpowers/detail-view-recipe.md
//   - Result-Object statt throw (AGENTS.md §Server-Actions)
//   - Nested-FKs IMMER mit Array.isArray(x) ? x[0] : x normalisieren
//   - Verwalter wird SEPARAT geladen (kein FK-Embed-Raten auf
//     hauptansprechpartner_user_id -> profiles; die Liste macht das genauso)

import { createClient } from '@/lib/supabase/server'

const ORG_COLUMNS =
  'id, name, typ, rechtsform, onboarding_status, anschrift, standort_adresse, standort_plz, ' +
  'steuernummer, ust_id, created_at, updated_at, parent_stripe_customer_id, ' +
  'parent_stripe_default_pm_id, vertrag_unterzeichnet_id, akademie_erst_anzahlung_eur, ' +
  'akademie_max_faelle_monat, akademie_radius_km, use_custom_branding, brand_primary, ' +
  'brand_secondary, brand_accent, brand_extracted_at, logo_url, hauptansprechpartner_user_id, ' +
  // Communities sind organisationen mit typ='community' — es gibt KEINE communities-Tabelle.
  'community_exklusiv, community_max_faelle_monat, community_leaderboard_aktiv, einsatzgebiet_radius_km'

export type OrganisationVerwalter = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
}

export type OrganisationDetail = {
  id: string
  name: string
  typ: string | null
  rechtsform: string | null
  onboardingStatus: string
  anschrift: string | null
  standortAdresse: string | null
  standortPlz: string | null
  steuernummer: string | null
  ustId: string | null
  createdAt: string | null
  updatedAt: string
  // Billing
  stripeCustomerId: string | null
  stripeDefaultPmId: string | null
  vertragUnterzeichnetId: string | null
  // Akademie-spezifisch
  akademieErstAnzahlungEur: number | null
  akademieMaxFaelleMonat: number | null
  akademieRadiusKm: number | null
  // Community-spezifisch (typ='community')
  communityExklusiv: boolean
  communityMaxFaelleMonat: number | null
  communityLeaderboardAktiv: boolean
  einsatzgebietRadiusKm: number | null
  // Whitelabel-Branding
  useCustomBranding: boolean
  brandPrimary: string | null
  brandSecondary: string | null
  brandAccent: string | null
  brandExtractedAt: string | null
  logoUrl: string | null
  verwalter: OrganisationVerwalter | null
}

type OrgRow = {
  id: string
  name: string
  typ: string | null
  rechtsform: string | null
  onboarding_status: string
  anschrift: string | null
  standort_adresse: string | null
  standort_plz: string | null
  steuernummer: string | null
  ust_id: string | null
  created_at: string | null
  updated_at: string
  parent_stripe_customer_id: string | null
  parent_stripe_default_pm_id: string | null
  vertrag_unterzeichnet_id: string | null
  akademie_erst_anzahlung_eur: number | null
  akademie_max_faelle_monat: number | null
  akademie_radius_km: number | null
  community_exklusiv: boolean | null
  community_max_faelle_monat: number | null
  community_leaderboard_aktiv: boolean | null
  einsatzgebiet_radius_km: number | null
  use_custom_branding: boolean
  brand_primary: string | null
  brand_secondary: string | null
  brand_accent: string | null
  brand_extracted_at: string | null
  logo_url: string | null
  hauptansprechpartner_user_id: string | null
}

export async function getOrganisationDetail(
  id: string,
): Promise<{ ok: true; data: OrganisationDetail } | { ok: false; error: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('organisationen')
    .select(ORG_COLUMNS)
    .eq('id', id)
    .single()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Organisation nicht gefunden.' }

  const org = data as unknown as OrgRow

  // Verwalter separat — nur wenn gesetzt (spart die Query sonst).
  let verwalter: OrganisationVerwalter | null = null
  if (org.hauptansprechpartner_user_id) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, vorname, nachname, email')
      .eq('id', org.hauptansprechpartner_user_id)
      .maybeSingle()
    const p = prof as unknown as OrganisationVerwalter | null
    verwalter = p ?? null
  }

  return {
    ok: true,
    data: {
      id: org.id,
      name: org.name,
      typ: org.typ,
      rechtsform: org.rechtsform,
      onboardingStatus: org.onboarding_status,
      anschrift: org.anschrift,
      standortAdresse: org.standort_adresse,
      standortPlz: org.standort_plz,
      steuernummer: org.steuernummer,
      ustId: org.ust_id,
      createdAt: org.created_at,
      updatedAt: org.updated_at,
      stripeCustomerId: org.parent_stripe_customer_id,
      stripeDefaultPmId: org.parent_stripe_default_pm_id,
      vertragUnterzeichnetId: org.vertrag_unterzeichnet_id,
      akademieErstAnzahlungEur: org.akademie_erst_anzahlung_eur,
      akademieMaxFaelleMonat: org.akademie_max_faelle_monat,
      akademieRadiusKm: org.akademie_radius_km,
      communityExklusiv: org.community_exklusiv ?? false,
      communityMaxFaelleMonat: org.community_max_faelle_monat,
      communityLeaderboardAktiv: org.community_leaderboard_aktiv ?? false,
      einsatzgebietRadiusKm: org.einsatzgebiet_radius_km,
      useCustomBranding: org.use_custom_branding,
      brandPrimary: org.brand_primary,
      brandSecondary: org.brand_secondary,
      brandAccent: org.brand_accent,
      brandExtractedAt: org.brand_extracted_at,
      logoUrl: org.logo_url,
      verwalter,
    },
  }
}

export type OrganisationMitglied = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  paket: string | null
  istAktiv: boolean
  verifiziert: boolean
}

type MitgliedRow = {
  id: string
  paket: string | null
  ist_aktiv: boolean | null
  verifiziert: boolean | null
  profiles: unknown
}

/**
 * Die Sachverstaendigen dieser Organisation. Liefert bei Fehler `[]` —
 * ein leerer Mitglieder-Tab ist besser als eine gecrashte Detail-View.
 */
export async function getOrganisationMitglieder(orgId: string): Promise<OrganisationMitglied[]> {
  const supabase = await createClient()

  // FK-Hint wie in admin/sachverstaendige/[id] (dort verifiziert).
  const { data, error } = await supabase
    .from('sachverstaendige')
    .select(
      'id, paket, ist_aktiv, verifiziert, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, email)',
    )
    .eq('organisation_id', orgId)

  if (error) {
    console.error('[organisationen/mitglieder]', error.message)
    return []
  }

  return ((data ?? []) as unknown as MitgliedRow[]).map((row) => {
    // AGENTS.md: nested FK kommt je nach Cardinality als Array ODER Objekt.
    const p = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as {
      vorname: string | null
      nachname: string | null
      email: string | null
    } | null

    return {
      id: row.id,
      vorname: p?.vorname ?? null,
      nachname: p?.nachname ?? null,
      email: p?.email ?? null,
      paket: row.paket,
      istAktiv: row.ist_aktiv ?? false,
      verifiziert: row.verifiziert ?? false,
    }
  })
}
