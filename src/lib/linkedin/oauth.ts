const SCOPES = 'openid profile email r_organization_social w_organization_social'

export function buildAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI ?? '',
    state,
    scope: SCOPES,
  })
  return `https://www.linkedin.com/oauth/v2/authorization?${p.toString()}`
}

export async function exchangeCode(code: string) {
  const p = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI ?? '',
    client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
    client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
  })
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: p,
  })
  if (!res.ok) throw new Error(`Token-Tausch fehlgeschlagen: ${res.status}`)
  const j = await res.json() as { access_token: string; refresh_token?: string; expires_in: number; scope?: string }
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, expiresIn: j.expires_in, scope: j.scope ?? null }
}

/** First org the authenticated user administers. */
export async function fetchAdminOrgUrn(token: string): Promise<string | null> {
  const res = await fetch(
    'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
    { headers: { Authorization: `Bearer ${token}`, 'LinkedIn-Version': '202505', 'X-Restli-Protocol-Version': '2.0.0' } },
  )
  if (!res.ok) return null
  const j = await res.json() as { elements?: Array<{ organizationalTarget?: string }> }
  return j.elements?.[0]?.organizationalTarget ?? null
}
