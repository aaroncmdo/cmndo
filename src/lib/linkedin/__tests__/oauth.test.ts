import { describe, it, expect, beforeEach } from 'vitest'
import { buildAuthorizeUrl } from '../oauth'

describe('buildAuthorizeUrl', () => {
  beforeEach(() => {
    process.env.LINKEDIN_CLIENT_ID = 'cid'
    process.env.LINKEDIN_REDIRECT_URI = 'https://app.claimondo.de/api/auth/linkedin/callback'
  })
  it('includes client_id, redirect_uri, state and org scopes', () => {
    const url = new URL(buildAuthorizeUrl('xyz'))
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('state')).toBe('xyz')
    expect(url.searchParams.get('scope')).toContain('w_organization_social')
    expect(url.searchParams.get('response_type')).toBe('code')
  })
})
