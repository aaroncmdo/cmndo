// AAR-902 Prototyp Smoke-Helper: laesst dem E2E-Test erlauben, den
// frisch erzeugten Magic-Link-Token via Email zu pullen. NUR in Dev-Mode.
// Production-Build returnt 404 (Next.js fuehrt diese Route gar nicht aus).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 })
  }
  const url = new URL(req.url)
  const email = url.searchParams.get('email')
  if (!email) {
    return NextResponse.json({ error: 'email param required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('id, created_at')
    .eq('email', email)
    .eq('source_channel', 'mini_wizard')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!lead) {
    return NextResponse.json({ error: 'lead not found' }, { status: 404 })
  }
  const { data: flowLink } = await admin
    .from('flow_links')
    .select('token, expires_at')
    .eq('lead_id', lead.id)
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!flowLink) {
    return NextResponse.json({ error: 'no flow_link' }, { status: 404 })
  }
  return NextResponse.json({ token: flowLink.token, expiresAt: flowLink.expires_at })
}
