import type { SupabaseClient } from '@supabase/supabase-js'

export type PartnerRolle = 'sachverstaendiger' | 'werkstatt' | 'makler'

export type PartnerPolicy = {
  rolle: PartnerRolle
  self_signup_erlaubt: boolean
  braucht_review: boolean
  braucht_zahlung: boolean
  auto_konvertieren: boolean
}

/** Pure Gate-Entscheidungen aus einer Policy-Zeile. */
export function sollAutoKonvertieren(p: PartnerPolicy): boolean {
  return p.auto_konvertieren
}
export function brauchtReview(p: PartnerPolicy): boolean {
  return p.braucht_review
}
export function brauchtZahlung(p: PartnerPolicy): boolean {
  return p.braucht_zahlung
}
export function selfSignupErlaubt(p: PartnerPolicy): boolean {
  return p.self_signup_erlaubt
}

/** Laedt die Policy einer Rolle aus der DB (Fallback: konservativ = review, kein auto). */
export async function ladePartnerPolicy(
  db: SupabaseClient,
  rolle: PartnerRolle,
): Promise<PartnerPolicy> {
  const { data } = await db
    .from('partner_rollen_policy')
    .select('*')
    .eq('rolle', rolle)
    .maybeSingle()
  if (!data) {
    return {
      rolle,
      self_signup_erlaubt: false,
      braucht_review: true,
      braucht_zahlung: false,
      auto_konvertieren: false,
    }
  }
  return {
    rolle,
    self_signup_erlaubt: Boolean(data.self_signup_erlaubt),
    braucht_review: Boolean(data.braucht_review),
    braucht_zahlung: Boolean(data.braucht_zahlung),
    auto_konvertieren: Boolean(data.auto_konvertieren),
  }
}
