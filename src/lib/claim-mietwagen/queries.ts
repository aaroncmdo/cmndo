// AAR-838: Claim-Mietwagen Queries

import { createClient } from '@/lib/supabase/server'

export type ClaimMietwagen = {
  id: string
  claim_id: string
  status: string
  fahrzeugklasse: string | null
  anbieter: string | null
  mietvertrag_nr: string | null
  beginn_datum: string | null
  ende_datum: string | null
  tatsaechliches_ende: string | null
  tage_gesamt: number | null
  tagespreis_netto: number | null
  gesamtkosten_netto: number | null
  erstattet_durch_vs: boolean | null
  erstattungsbetrag: number | null
  erstattung_am: string | null
  erstattbar_max_tage: number | null
  rechnung_url: string | null
  notiz: string | null
  created_at: string
  updated_at: string
  created_by_user_id: string | null
}

export async function getMietwagenfuerClaim(claimId: string): Promise<ClaimMietwagen[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('claim_mietwagen')
    .select(
      'id, claim_id, status, fahrzeugklasse, anbieter, mietvertrag_nr, beginn_datum, ende_datum, tatsaechliches_ende, tage_gesamt, tagespreis_netto, gesamtkosten_netto, erstattet_durch_vs, erstattungsbetrag, erstattung_am, erstattbar_max_tage, rechnung_url, notiz, created_at, updated_at, created_by_user_id',
    )
    .eq('claim_id', claimId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[AAR-838] getMietwagenfuerClaim:', error.message)
    return []
  }

  return (data ?? []) as ClaimMietwagen[]
}
