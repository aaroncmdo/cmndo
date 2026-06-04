// AAR-104: GET Fall-Zusammenfassungen (fuer History)
import { createClient } from '@/lib/supabase/server'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const fallId = req.nextUrl.searchParams.get('fall_id')
  if (!fallId) return NextResponse.json({ error: 'fall_id required' }, { status: 400 })

  const supabase = await createClient()
  // CMM-49 P4-TODO: claimId aus Claim-Kontext threaden statt faelle-Lookup (interim).
  // fall_id-Query-Param bleibt (externer Contract); intern auf claim_id auflösen.
  const claimId = await resolveClaimId(supabase, fallId)
  if (!claimId) return NextResponse.json({ summaries: [] })

  const { data: summaries, error } = await supabase
    .from('fall_summaries')
    .select(`
      id, claim_id, kunden_anliegen, zusammenfassung, ai_modell,
      prompt_tokens, completion_tokens, generated_at,
      generated_by:profiles!fall_summaries_generated_by_user_id_fkey (vorname, nachname)
    `)
    .eq('claim_id', claimId)
    .order('generated_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ summaries: summaries ?? [] })
}
