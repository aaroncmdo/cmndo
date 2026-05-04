// AAR-84: Cardentity API Client (OAuth2 Client Credentials).
// Env-Vars (Vercel only): CARDENTITY_CLIENT_ID, CARDENTITY_CLIENT_SECRET,
//   CARDENTITY_API_URL (Pflicht — kein verlässlicher Default vorhanden).

const API_URL = process.env.CARDENTITY_API_URL ?? 'https://api.cardentity.com'

type TokenCache = { token: string; expiresAt: number } | null
let tokenCache: TokenCache = null

export type CardentityReport = {
  vin: string
  make?: string
  model?: string
  firstRegistrationDate?: string
  valuation?: { current?: number; currency?: string }
  equipment?: Array<{ code: string; name: string }>
  events?: Array<{ type: string; date: string; mileage?: number }>
  [k: string]: unknown
}

export class CardentityError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'CardentityError'
  }
}

/**
 * Wrapper um globalThis.fetch der Connection-Errors (DNS, TCP, TLS) auf
 * eine sprechende CardentityError mappt statt dem nodejs-internen
 * „fetch failed" — wird in der UI sonst 1:1 dem Dispatcher angezeigt
 * und ist nutzlos.
 */
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    const cause = err instanceof Error ? (err.cause ?? err.message) : String(err)
    const causeStr =
      typeof cause === 'object' && cause && 'code' in cause
        ? `${(cause as { code: string }).code}`
        : String(cause)
    const apiUrlHinweis = !process.env.CARDENTITY_API_URL
      ? ` — CARDENTITY_API_URL ist nicht gesetzt, Default „${API_URL}" wird verwendet`
      : ''
    throw new CardentityError(
      0,
      `Cardentity-API nicht erreichbar (${causeStr})${apiUrlHinweis}`,
    )
  }
}

/**
 * OAuth2 Client Credentials. In-Memory-Cache mit 60s-Puffer vor Ablauf.
 */
export async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token
  }

  const clientId = process.env.CARDENTITY_CLIENT_ID
  const clientSecret = process.env.CARDENTITY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new CardentityError(0, 'CARDENTITY_CLIENT_ID/SECRET nicht konfiguriert')
  }

  const res = await safeFetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new CardentityError(res.status, `OAuth-Fehler ${res.status}: ${txt}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  return data.access_token
}

export async function checkVinAvailability(vin: string): Promise<boolean> {
  const token = await getAccessToken()
  const res = await safeFetch(`${API_URL}/v1/reports/${encodeURIComponent(vin)}/availability`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (res.status === 404) return false
  if (res.status === 401) {
    tokenCache = null
    throw new CardentityError(401, 'Token abgelaufen — bitte erneut versuchen')
  }
  if (!res.ok) throw new CardentityError(res.status, `Availability-Fehler ${res.status}`)
  const data = (await res.json()) as { available?: boolean }
  return data.available !== false
}

export async function getVehicleReport(
  vin: string,
  options: { mileage?: number; firstRegistrationDate?: string; lang?: string } = {},
): Promise<CardentityReport | null> {
  const token = await getAccessToken()
  const params = new URLSearchParams({ format: 'json', lang: options.lang ?? 'de' })
  if (options.mileage != null) params.set('mileage', String(options.mileage))
  if (options.firstRegistrationDate) params.set('firstRegistrationDate', options.firstRegistrationDate)

  const res = await safeFetch(
    `${API_URL}/v1/reports/${encodeURIComponent(vin)}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  )

  if (res.status === 404) return null
  if (res.status === 401) {
    tokenCache = null
    throw new CardentityError(401, 'Token abgelaufen — bitte erneut versuchen')
  }
  if (res.status === 403) throw new CardentityError(403, 'Cardentity: Insufficient permissions')
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new CardentityError(res.status, `Report-Fehler ${res.status}: ${txt}`)
  }

  return (await res.json()) as CardentityReport
}
