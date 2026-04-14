// AAR-104: GET Fall-Zusammenfassungen (fuer History)
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const fallId = req.nextUrl.searchParams.get('fall_id')
  if (!fallId) return NextResponse.json({ error: 'fall_id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: summaries, error } = await supabase
    .from('fall_summaries')
    .select(`
      id, fall_id, kunden_anliegen, zusammenfassung, ai_modell,
      prompt_tokens, completion_tokens, generated_at,
      generated_by:profiles!fall_summaries_generated_by_user_id_fkey (vorname, nachname)
    `)
    .eq('fall_id', fallId)
    .order('generated_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ summaries: summaries ?? [] })
}
