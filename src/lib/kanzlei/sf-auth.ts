// AAR-kanzlei-oauth: Salesforce OAuth2 Password-Grant-Flow.
//
// Stand der Kanzlei-Integration nach dem Meeting mit dem LexDrive-Dev
// (2026-04-21): HMAC fällt weg, stattdessen SF-Standard-OAuth2 mit
// grant_type=password. Password ist die Konkatenation aus User-Passwort
// + Security-Token (SF-spezifisch). Token hat 5 Min TTL.
//
// Wir cachen den Token in-Memory pro Node-Prozess. In Serverless (Vercel)
// ist der Cache pro Lambda-Container — das ist ok, weil das Refresh-Fenster
// großzügig ist (4-5 Requests pro Mandat).
//
// Env-Variablen siehe .env.local / Vercel:
//   KANZLEI_SF_AUTH_URL       — z. B. https://test.salesforce.com/services/oauth2/token
//   KANZLEI_SF_API_URL        — Basis für Apex-REST-Endpoints
//   KANZLEI_SF_USERNAME
//   KANZLEI_SF_PASSWORD       — nur Passwort, ohne Security-Token
//   KANZLEI_SF_SECURITY_TOKEN
//   KANZLEI_SF_CLIENT_ID      — Connected-App Client-ID
//   KANZLEI_SF_CLIENT_SECRET  — Connected-App Client-Secret

interface SfTokenCache {
  token: string
  expiresAt: number
  instanceUrl: string | null
}

let cache: SfTokenCache | null = null

// 30 Sekunden Sicherheitspuffer, damit wir nicht mit einem gerade-ablaufenden
// Token Requests abschicken.
const SAFETY_MARGIN_MS = 30 * 1000

export type SfAuthResult =
  | { ok: true; token: string; instanceUrl: string | null }
  | { ok: false; error: string }

export async function getSfAccessToken(): Promise<SfAuthResult> {
  const authUrl = process.env.KANZLEI_SF_AUTH_URL
  const username = process.env.KANZLEI_SF_USERNAME
  const password = process.env.KANZLEI_SF_PASSWORD
  const securityToken = process.env.KANZLEI_SF_SECURITY_TOKEN
  const clientId = process.env.KANZLEI_SF_CLIENT_ID
  const clientSecret = process.env.KANZLEI_SF_CLIENT_SECRET

  if (!authUrl || !username || !password || !securityToken || !clientId || !clientSecret) {
    return {
      ok: false,
      error:
        'Kanzlei-SF-Config unvollständig — mindestens eine der KANZLEI_SF_*-Env-Vars fehlt',
    }
  }

  // Cache-Hit?
  const now = Date.now()
  if (cache && cache.expiresAt - SAFETY_MARGIN_MS > now) {
    return { ok: true, token: cache.token, instanceUrl: cache.instanceUrl }
  }

  // SF-Standard: password + securityToken concatenated
  const passwordPlusToken = `${password}${securityToken}`

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password: passwordPlusToken,
  })

  try {
    const resp = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    const json = (await resp.json().catch(() => null)) as
      | {
          access_token?: string
          instance_url?: string
          issued_at?: string
          error?: string
          error_description?: string
        }
      | null

    if (!resp.ok || !json?.access_token) {
      const msg = json?.error_description || json?.error || `HTTP ${resp.status}`
      return { ok: false, error: `Salesforce-Auth: ${msg}` }
    }

    // SF-Tokens haben typisch 2h TTL laut Connected-App-Policy, Meeting-Zusage
    // vom Kanzlei-Dev ist 5 Min. Wir setzen defensiv auf 4 Min ab issued_at.
    const issuedAtMs = json.issued_at ? Number(json.issued_at) : now
    const expiresAt = issuedAtMs + 4 * 60 * 1000
    cache = {
      token: json.access_token,
      expiresAt,
      instanceUrl: json.instance_url ?? null,
    }
    return { ok: true, token: json.access_token, instanceUrl: cache.instanceUrl }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Salesforce-Auth-Netzwerkfehler: ${msg}` }
  }
}

/** Für Tests + Deploy-Rotation — erzwingt Neu-Fetch beim nächsten Aufruf. */
export function clearSfAuthCache(): void {
  cache = null
}
