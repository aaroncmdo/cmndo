// Baileys-Service-Client für Next.js.
// Phase 1: nur isOnWhatsApp(phone) Lookup. Send kommt in Phase 2.
//
// Service läuft auf demselben VPS unter localhost:3055 (kein externes
// Routing nötig). Für Vercel-/CI-Builds gibts BAILEYS_BASE_URL Override.

const DEFAULT_BASE = 'http://localhost:3055'

function getBaseUrl(): string {
  return process.env.BAILEYS_BASE_URL ?? DEFAULT_BASE
}

function getAuthToken(): string | null {
  return process.env.BAILEYS_AUTH_TOKEN ?? null
}

export type WhatsAppCheckResult =
  | { ok: true; onWhatsApp: boolean; jid: string | null }
  | { ok: false; error: string; code?: 'service_unavailable' | 'invalid_phone' | 'lookup_failed' | 'config_missing' }

/**
 * Prüft ob eine Telefonnummer ein WhatsApp-Konto hat.
 * Service-State 'connecting' / 'disconnected' → service_unavailable (Caller
 * sollte fallback auf Twilio-Lookup oder skippen).
 *
 * Timeout 5s — wir blockieren keine User-Action länger.
 */
export async function isOnWhatsApp(phone: string): Promise<WhatsAppCheckResult> {
  const base = getBaseUrl()
  const token = getAuthToken()

  if (!base) {
    return { ok: false, error: 'BAILEYS_BASE_URL nicht gesetzt', code: 'config_missing' }
  }

  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 5000)

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['X-Baileys-Token'] = token

    const res = await fetch(`${base}/check`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone }),
      signal: ctrl.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)

    if (res.status === 503) {
      return { ok: false, error: 'baileys_not_connected', code: 'service_unavailable' }
    }
    if (res.status === 400) {
      return { ok: false, error: 'invalid_phone', code: 'invalid_phone' }
    }
    if (!res.ok) {
      return { ok: false, error: `baileys returned ${res.status}`, code: 'lookup_failed' }
    }

    const data = (await res.json()) as { on_whatsapp?: boolean; jid?: string | null }
    return {
      ok: true,
      onWhatsApp: data.on_whatsapp === true,
      jid: data.jid ?? null,
    }
  } catch (err) {
    clearTimeout(timeout)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'unknown',
      code: 'lookup_failed',
    }
  }
}

/**
 * Health-Check für Monitoring + Admin-Smoke-Tests.
 */
export async function getBaileysHealth(): Promise<
  | { ok: true; state: 'open' | 'connecting' | 'disconnected'; hasQr: boolean; timestamp: string }
  | { ok: false; error: string }
> {
  const base = getBaseUrl()
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 3000)
  try {
    const res = await fetch(`${base}/health`, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(timeout)
    if (!res.ok) return { ok: false, error: `status ${res.status}` }
    const data = (await res.json()) as { state: string; has_qr: boolean; timestamp: string }
    return {
      ok: true,
      state: data.state as 'open' | 'connecting' | 'disconnected',
      hasQr: data.has_qr,
      timestamp: data.timestamp,
    }
  } catch (err) {
    clearTimeout(timeout)
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}
