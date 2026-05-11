// AAR-kanzlei-oauth: Salesforce OAuth2 Client-Credentials-Flow (Server-to-Server).
//
// 2026-05-11: Migration von grant_type=password → grant_type=client_credentials.
// LexDrive hat die Connected-App umgestellt — der Salesforce-User
// (aaron.sprafke@claimondo.de) ist jetzt als `clientCredentialsFlowUser` in
// der App-Policy hinterlegt. Claimondo authentisiert sich als App, nicht als
// User — keine username/password/security_token mehr im Request.
//
// Wir cachen den Token in-Memory pro Node-Prozess. Bei Single-Process-PM2
// auf dem VPS ist der Cache prozesslang stabil — 4-5 Requests pro Mandat
// passen locker in das 5-Min-TTL.
//
// Env-Variablen siehe .env.local:
//   KANZLEI_SF_AUTH_URL       — My-Domain-URL: https://ruby-momentum-209.my.salesforce.com/services/oauth2/token
//                              (NICHT login.salesforce.com — Client-Credentials braucht My-Domain)
//   KANZLEI_SF_API_URL        — Basis für Apex-REST-Endpoints
//   KANZLEI_SF_CLIENT_ID      — Connected-App Consumer Key
//   KANZLEI_SF_CLIENT_SECRET  — Connected-App Consumer Secret
//
// Deprecated (nicht mehr verwendet, koennen aus .env entfernt werden):
//   KANZLEI_SF_USERNAME, KANZLEI_SF_PASSWORD, KANZLEI_SF_SECURITY_TOKEN

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
  const clientId = process.env.KANZLEI_SF_CLIENT_ID
  const clientSecret = process.env.KANZLEI_SF_CLIENT_SECRET

  if (!authUrl || !clientId || !clientSecret) {
    return {
      ok: false,
      error:
        'Kanzlei-SF-Config unvollstaendig — KANZLEI_SF_AUTH_URL / CLIENT_ID / CLIENT_SECRET fehlt',
    }
  }

  // Cache-Hit?
  const now = Date.now()
  if (cache && cache.expiresAt - SAFETY_MARGIN_MS > now) {
    return { ok: true, token: cache.token, instanceUrl: cache.instanceUrl }
  }

  // Client-Credentials-Flow: nur client_id + client_secret. Der Salesforce-
  // User ist in der Connected-App-Policy als clientCredentialsFlowUser
  // hinterlegt (aaron.sprafke@claimondo.de) — Requests laufen unter dem.
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
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
