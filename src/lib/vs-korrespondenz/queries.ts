// AAR-837: VS-Korrespondenz Queries

import { createClient } from '@/lib/supabase/server'

export type VsKorrespondenz = {
  id: string
  claim_id: string
  richtung: string
  kanal: string
  betreff: string | null
  versicherung: string | null
  aktenzeichen: string | null
  notiz: string | null
  attachment_url: string | null
  datum: string
  status: string
  wartet_auf_antwort_bis: string | null
  typ: string | null
  created_at: string
  created_by_user_id: string | null
}

export async function getKorrespondenzForClaim(claimId: string): Promise<VsKorrespondenz[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vs_korrespondenz')
    .select('id, claim_id, richtung, kanal, betreff, versicherung, aktenzeichen, notiz, attachment_url, datum, status, wartet_auf_antwort_bis, typ, created_at, created_by_user_id')
    .eq('claim_id', claimId)
    .order('datum', { ascending: false })

  if (error) {
    console.error('[AAR-837] getKorrespondenzForClaim:', error.message)
    return []
  }

  return (data ?? []) as VsKorrespondenz[]
}
