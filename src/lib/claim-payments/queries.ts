// AAR-837: Claim-Payments Queries

import { createClient } from '@/lib/supabase/server'

export type ClaimPayment = {
  id: string
  claim_id: string
  status: string
  forderungsbetrag: number | null
  erhaltener_betrag: number | null
  differenz_betrag: number | null
  zahlungseingang_am: string | null
  zahlungsweg: string | null
  zahlungsreferenz: string | null
  notiz: string | null
  created_at: string
  updated_at: string
  created_by_user_id: string | null
}

export async function getPaymentsForClaim(claimId: string): Promise<ClaimPayment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('claim_payments')
    .select('id, claim_id, status, forderungsbetrag, erhaltener_betrag, differenz_betrag, zahlungseingang_am, zahlungsweg, zahlungsreferenz, notiz, created_at, updated_at, created_by_user_id')
    .eq('claim_id', claimId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[AAR-837] getPaymentsForClaim:', error.message)
    return []
  }

  return (data ?? []) as ClaimPayment[]
}
