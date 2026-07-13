// SP5a: Microsoft OAuth Connect (Authorization Code Flow Init). Env-gated.
// Mirror von /api/auth/google/connect — raw MS-OAuth (Graph).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { externalUrl, externalOrigin } from '@/lib/external-url'
import { MS_AUTHORIZE_ENDPOINT, MS_SCOPES } from '@/lib/microsoft/graph-client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return NextResponse.redirect(externalUrl(req, '/login'))

  const rawReturn = req.nextUrl.searchParams.get('return') ?? '/mitarbeiter/profil'
  const safeReturn = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/mitarbeiter/profil'

  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET
  // externalOrigin statt url.origin — hinter nginx ist req.url 0.0.0.0:3001; die
  // redirect_uri muss exakt der vom callback-Endpoint erwarteten entsprechen.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? externalOrigin(req)
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(externalUrl(req, `${safeReturn}?ms_error=not_configured`))
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: `${baseUrl}/api/auth/microsoft/callback`,
    response_mode: 'query',
    scope: MS_SCOPES,
    state: `${user.id}|${safeReturn}`,
  })
  return NextResponse.redirect(`${MS_AUTHORIZE_ENDPOINT}?${params.toString()}`)
}
