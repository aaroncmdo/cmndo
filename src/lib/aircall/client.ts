import crypto from 'crypto'

const API_BASE = 'https://api.aircall.io'

/**
 * Aircall API Wrapper mit Basic Auth.
 */
async function aircallFetch(path: string, options?: RequestInit): Promise<Response> {
  const apiId = process.env.AIRCALL_API_ID
  const apiToken = process.env.AIRCALL_API_TOKEN
  if (!apiId || !apiToken) throw new Error('AIRCALL_API_ID oder AIRCALL_API_TOKEN nicht gesetzt')

  const auth = Buffer.from(`${apiId}:${apiToken}`).toString('base64')
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
}

/** Outbound-Call starten. Aircall ruft zuerst den User an, dann den Kunden. */
export async function startOutboundCall(opts: {
  userId: number
  toNumber: string
  fromNumberId?: number
}): Promise<{ id: number; status: string }> {
  const numberId = opts.fromNumberId ?? parseInt(process.env.AIRCALL_NUMBER_ID ?? '0')
  if (!numberId) throw new Error('AIRCALL_NUMBER_ID nicht gesetzt')

  const res = await aircallFetch(`/v1/calls`, {
    method: 'POST',
    body: JSON.stringify({
      number_id: numberId,
      to: opts.toNumber,
      user_id: opts.userId,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Aircall Call fehlgeschlagen (${res.status}): ${body}`)
  }

  const data = await res.json()
  return { id: data.call?.id ?? data.id, status: data.call?.status ?? 'initiated' }
}

/** Call-Details abrufen */
export async function getCall(callId: number) {
  const res = await aircallFetch(`/v1/calls/${callId}`)
  if (!res.ok) throw new Error(`Aircall getCall fehlgeschlagen: ${res.status}`)
  return (await res.json()).call
}

/** Recording-URL abrufen */
export async function getCallRecording(callId: number): Promise<string | null> {
  const call = await getCall(callId)
  return call?.recording ?? null
}

/** Transkript abrufen (nur mit Aircall AI) */
export async function getCallTranscript(callId: number): Promise<{ segments: Array<{ speaker: string; text: string; start: number; end: number }> } | null> {
  try {
    const res = await aircallFetch(`/v1/calls/${callId}/transcription`)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

/** User-Liste abrufen (für Test-Zwecke) */
export async function getUsers(): Promise<Array<{ id: number; name: string; email: string }>> {
  const res = await aircallFetch('/v1/users')
  if (!res.ok) throw new Error(`Aircall getUsers fehlgeschlagen: ${res.status}`)
  const data = await res.json()
  return data.users ?? []
}

/** Webhook-Signatur prüfen */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.AIRCALL_WEBHOOK_TOKEN
  if (!secret) return false
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
