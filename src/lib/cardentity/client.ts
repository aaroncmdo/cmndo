// AAR-84: Cardentity API Client (OAuth2 Client Credentials).
// Env-Vars (Vercel only): CARDENTITY_CLIENT_ID, CARDENTITY_CLIENT_SECRET,
//   CARDENTITY_API_URL (Default: https://api.cardentity.eu),
//   CARDENTITY_ACCESS_TOKEN (Smoke-Test-Override, 1h gültig).

const API_URL = process.env.CARDENTITY_API_URL ?? 'https://api.cardentity.eu'

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
 * Liest die exp-Claim aus einem JWT. Returns null wenn das Format kein
 * gültiger JWT ist. Kein Verify — wir vertrauen dem Token selbst, der
 * Provider-Server validiert ihn beim API-Call.
 */
function decodeJwtExp(token: string): number | null {
  try {
    const [, payloadB64] = token.split('.')
    if (!payloadB64) return null
    // base64url → base64
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(b64, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as { exp?: number }
    return typeof parsed.exp === 'number' ? parsed.exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * OAuth2 Client Credentials. In-Memory-Cache mit 60s-Puffer vor Ablauf.
 *
 * Override: Wenn `CARDENTITY_ACCESS_TOKEN` in der env gesetzt ist, wird
 * der OAuth-Flow komplett übersprungen und der Direct-Token genutzt.
 * Praktisch für Smoke-Tests bevor der OAuth-Endpoint stimmt — der Token
 * gilt 1h, danach wieder neu setzen oder OAuth-Setup fertigstellen.
 */
export async function getAccessToken(): Promise<string> {
  // Direct-Token-Override (Test/Onboarding-Phase)
  const directToken = process.env.CARDENTITY_ACCESS_TOKEN
  if (directToken) {
    const expMs = decodeJwtExp(directToken)
    if (expMs && expMs < Date.now() + 60_000) {
      throw new CardentityError(
        401,
        `CARDENTITY_ACCESS_TOKEN ist abgelaufen (exp=${new Date(expMs).toISOString()}) — neuen Token aus dem Cardentity-Dashboard setzen oder CARDENTITY_CLIENT_ID/SECRET konfigurieren`,
      )
    }
    return directToken
  }

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token
  }

  const clientId = process.env.CARDENTITY_CLIENT_ID
  const clientSecret = process.env.CARDENTITY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new CardentityError(
      0,
      'CARDENTITY_CLIENT_ID/SECRET nicht konfiguriert (alternativ CARDENTITY_ACCESS_TOKEN für Smoke-Test setzen)',
    )
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
  // 2026-05-07 (Bug-Smoke): Vorher generisches „Availability-Fehler 403".
  // Cardentity sendet 403 wenn der Account/Plan keine Berechtigung für die
  // VIN hat — die Fehlermeldung soll dem Dispatcher klar sagen, dass nicht
  // er ein Problem hat sondern unsere Subscription.
  if (res.status === 403) {
    throw new CardentityError(403, 'Cardentity: Account hat keine Berechtigung für diese VIN — bitte Subscription/Region prüfen')
  }
  if (!res.ok) throw new CardentityError(res.status, `Availability-Fehler ${res.status}`)
  const data = (await res.json()) as { available?: boolean }
  return data.available !== false
}

/**
 * 2026-05-07 (Bug-Smoke): Cardentity erwartet `firstRegistrationDate` strikt
 * als YYYY-MM-DD oder den Literal-String "estimate". Unsere DB-Spalte
 * `erstzulassung` ist freier Text und enthält oft Deutsche Formate
 * (DD.MM.YYYY) oder Monatsangaben (MM/YYYY). Diese Normalisierung
 * verhindert das beobachtete „Report-Fehler 400: First registration date
 * must be in YYYY-MM-DD format or estimate".
 *
 * Akzeptierte Inputs:
 *   - "2020-06-15"        → durchreichen
 *   - "15.06.2020"        → "2020-06-15"
 *   - "06.2020", "6/2020" → "2020-06-01"  (Monat-genau, Tag=01)
 *   - "2020"              → "2020-01-01"
 *   - alles andere        → "estimate" (Cardentity-Sonderwert)
 */
export function normalizeFirstRegistrationDate(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  const s = raw.trim()
  if (!s) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dmY = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (dmY) return `${dmY[3]}-${dmY[2]}-${dmY[1]}`
  const mY = s.match(/^(\d{1,2})[./](\d{4})$/)
  if (mY) return `${mY[2]}-${mY[1].padStart(2, '0')}-01`
  if (/^\d{4}$/.test(s)) return `${s}-01-01`
  return 'estimate'
}

export async function getVehicleReport(
  vin: string,
  options: { mileage?: number; firstRegistrationDate?: string; lang?: string } = {},
): Promise<CardentityReport | null> {
  const token = await getAccessToken()
  const params = new URLSearchParams({ format: 'json', lang: options.lang ?? 'de' })
  if (options.mileage != null) params.set('mileage', String(options.mileage))
  // 2026-05-07: Format-Normalisierung damit Cardentity nicht 400 wirft
  // wenn der DE-Formatierte Datums-String aus der DB kommt.
  const normalizedDate = normalizeFirstRegistrationDate(options.firstRegistrationDate)
  if (normalizedDate) params.set('firstRegistrationDate', normalizedDate)

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
