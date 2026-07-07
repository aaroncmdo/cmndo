import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCode, fetchAdminOrgUrn } from '@/lib/linkedin/oauth'
import { externalOrigin } from '@/lib/external-url'

export async function GET(request: Request) {
  const { user } = await requirePortalAccess(['admin']) // redirects if not admin
  const url = new URL(request.url)
  // externalOrigin statt request.url als Redirect-Base: hinter dem
  // nginx/PM2-Proxy ist der request.url-Origin die interne Bind-Adresse
  // (0.0.0.0:3000) → der OAuth-Ruecksprung ins Admin-Portal lief ins Leere.
  const appOrigin = externalOrigin(request)
  const jar = await cookies()
  const expectedState = jar.get('li_oauth_state')?.value
  const gotState = url.searchParams.get('state')
  if (!expectedState || !gotState || expectedState !== gotState) {
    return NextResponse.redirect(new URL('/admin/marketing/linkedin?error=state_mismatch', appOrigin))
  }
  jar.delete('li_oauth_state')
  const code = url.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/admin/marketing/linkedin?error=no_code', appOrigin))

  try {
    const tok = await exchangeCode(code)
    const orgUrn = (process.env.LINKEDIN_ORG_ID
      ? (process.env.LINKEDIN_ORG_ID.startsWith('urn:') ? process.env.LINKEDIN_ORG_ID : `urn:li:organization:${process.env.LINKEDIN_ORG_ID}`)
      : await fetchAdminOrgUrn(tok.accessToken)) ?? ''
    if (!orgUrn) return NextResponse.redirect(new URL('/admin/marketing/linkedin?error=no_org', appOrigin))

    const admin = createAdminClient()
    await admin.from('linkedin_oauth_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: insertErr } = await admin.from('linkedin_oauth_tokens').insert({
      organization_urn: orgUrn,
      access_token: tok.accessToken,
      refresh_token: tok.refreshToken,
      expires_at: new Date(Date.now() + tok.expiresIn * 1000).toISOString(),
      scope: tok.scope,
      connected_by: user.id,
    })
    if (insertErr) return NextResponse.redirect(new URL(`/admin/marketing/linkedin?error=${encodeURIComponent(insertErr.message)}`, appOrigin))
    return NextResponse.redirect(new URL('/admin/marketing/linkedin?connected=1', appOrigin))
  } catch (e) {
    return NextResponse.redirect(new URL(`/admin/marketing/linkedin?error=${encodeURIComponent((e as Error).message)}`, appOrigin))
  }
}
