// AAR-939 · Monika-Embed · Stream 4 — API-Calls
//
// loadConfig: sv_embed holt Theme/Telefon/WA/JWT vom Config-Endpoint (Stream 5).
// submitAnfrage: POST an /api/anfrage-from-lp (Stream 2).

import type { AnfragePayload, MonikaTheme } from './types'

export interface ConfigResponse {
  theme: MonikaTheme
  telefon: string | null
  whatsapp: string | null
  site_token: string | null
  paused?: boolean
  tracking?: {
    ga4MeasurementId: string | null
    gadsConversionId: string | null
    gadsConversionLabel: string | null
  } | null
}

/** Holt die SV-Embed-Site-Konfig (Stream 5). Wirft nicht — Caller faellt auf Default zurueck. */
export async function loadConfig(base: string, siteId: string): Promise<ConfigResponse | null> {
  try {
    const res = await fetch(`${base}/api/embed/config?site_id=${encodeURIComponent(siteId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    return (await res.json()) as ConfigResponse
  } catch {
    return null
  }
}

export type SubmitKanal = 'whatsapp' | 'sms' | 'email'
export type SubmitResult =
  | { ok: true; modus: 'callback'; anfrageId: string | null }
  | { ok: true; modus: 'flowlink'; kanal: SubmitKanal; token: string; anfrageId: string | null }
  | { ok: false; error: string }

/** POST an /api/anfrage-from-lp (Stream 2). keepalive, damit der Submit auch bei Navigation durchgeht. */
export async function submitAnfrage(base: string, payload: AnfragePayload): Promise<SubmitResult> {
  try {
    const res = await fetch(`${base}/api/anfrage-from-lp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
    if (!res.ok) {
      if (res.status === 429) return { ok: false, error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }
      return { ok: false, error: 'Senden fehlgeschlagen. Bitte erneut versuchen.' }
    }
    const data = (await res.json()) as {
      ok?: boolean
      anfrage_id?: string | null
      modus?: 'callback' | 'flowlink'
      kanal?: SubmitKanal
      token?: string
    }
    // Variante B (flowlink): der /flow-Link wurde an den Kunden gesendet (kanal/token tragen das Danke).
    if (data.modus === 'flowlink' && data.kanal && data.token) {
      return { ok: true, modus: 'flowlink', kanal: data.kanal, token: data.token, anfrageId: data.anfrage_id ?? null }
    }
    // Variante A (callback) bzw. aeltere Route ohne modus: backward-kompatibel.
    return { ok: true, modus: 'callback', anfrageId: data.anfrage_id ?? null }
  } catch {
    return { ok: false, error: 'Verbindungsfehler. Bitte erneut versuchen.' }
  }
}
