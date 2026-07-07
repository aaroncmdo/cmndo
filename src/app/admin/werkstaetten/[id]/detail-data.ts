import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ladePartnerBilling } from '@/lib/finance/partner-billing-actions'
import type { PartnerBillingAggregat } from '@/lib/finance/partner-billing'

// Loader fuer die Admin-Werkstatt-Detailseite. Reine Reads (kein DDL), Admin-gegated
// durch die Page. v_werkstatt_auftrag ist RLS-is_staff()-gegated -> Admin liest legitim
// alle Auftraege einer Werkstatt (gefiltert per werkstatt_id).

export interface WerkstattDetailAuftrag {
  claim_id: string
  claim_nummer: string | null
  richtung: string | null
  operative_status: string | null
  reparatur_termin_status: string | null
  gutachten_fertiggestellt_am: string | null
  gutachten_totalschaden: boolean | null
  besichtigung_start: string | null
  provision_betrag_netto: number | null
  provision_status: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  kennzeichen: string | null
}

export interface WerkstattDetailStammdaten {
  id: string
  name: string
  status: string | null
  adresse_strasse: string | null
  adresse_plz: string | null
  adresse_ort: string | null
  email: string | null
  telefon: string | null
  website: string | null
  ansprechpartner_name: string | null
  provision_betrag_netto: number | null
  provision_aktiv: boolean | null
  faehigkeiten: string[] | null
  bank_iban: string | null
  bank_bic: string | null
  bank_kontoinhaber: string | null
  ist_kleinunternehmer: boolean | null
  ust_id: string | null
  aktiviert_am: string | null
  created_at: string | null
  user_id: string | null
}

export interface WerkstattDetail {
  werkstatt: WerkstattDetailStammdaten
  staffel: { schwelle: number; bonus_betrag_netto: number }[]
  auftraege: WerkstattDetailAuftrag[]
  lastSignInAt: string | null
  forcePasswordChange: boolean | null
  billing: PartnerBillingAggregat | null
}

export async function ladeWerkstattDetail(id: string): Promise<WerkstattDetail | null> {
  const supabase = await createClient()

  const { data: w } = await supabase
    .from('werkstaetten')
    .select(
      'id, name, status, adresse_strasse, adresse_plz, adresse_ort, email, telefon, website, ansprechpartner_name, provision_betrag_netto, provision_aktiv, faehigkeiten, bank_iban, bank_bic, bank_kontoinhaber, ist_kleinunternehmer, ust_id, aktiviert_am, created_at, user_id',
    )
    .eq('id', id)
    .maybeSingle()
  if (!w) return null

  const [staffelRes, auftragRes] = await Promise.all([
    supabase
      .from('werkstatt_staffel_stufen')
      .select('schwelle, bonus_betrag_netto')
      .eq('werkstatt_id', id)
      .order('schwelle', { ascending: true }),
    supabase
      .from('v_werkstatt_auftrag')
      .select(
        'claim_id, claim_nummer, richtung, operative_status, reparatur_termin_status, gutachten_fertiggestellt_am, gutachten_totalschaden, besichtigung_start, provision_betrag_netto, provision_status, fahrzeug_hersteller, fahrzeug_modell, kennzeichen',
      )
      .eq('werkstatt_id', id)
      .order('besichtigung_start', { ascending: false, nullsFirst: false }),
  ])

  let lastSignInAt: string | null = null
  let forcePasswordChange: boolean | null = null
  if (w.user_id) {
    const admin = createAdminClient()
    const { data: authUser } = await admin.auth.admin.getUserById(w.user_id as string)
    lastSignInAt = authUser?.user?.last_sign_in_at ?? null
    const { data: prof } = await admin
      .from('profiles')
      .select('force_password_change')
      .eq('id', w.user_id as string)
      .maybeSingle()
    forcePasswordChange = (prof?.force_password_change as boolean | null | undefined) ?? null
  }

  const billing = await ladePartnerBilling('werkstatt', id)

  return {
    werkstatt: w as unknown as WerkstattDetailStammdaten,
    staffel: (staffelRes.data ?? []) as { schwelle: number; bonus_betrag_netto: number }[],
    auftraege: (auftragRes.data ?? []) as unknown as WerkstattDetailAuftrag[],
    lastSignInAt,
    forcePasswordChange,
    billing: billing.ok ? billing.aggregat : null,
  }
}
