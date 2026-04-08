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

/** KFZ-144: Call transferieren (für Bridge-Calls) */
export async function aircallTransferCall(opts: {
  callId: string; toNumber: string; type: 'external' | 'internal'
}): Promise<void> {
  const res = await aircallFetch(`/v1/calls/${opts.callId}/transfers`, {
    method: 'POST',
    body: JSON.stringify({ to: opts.toNumber, type: opts.type }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Aircall Transfer fehlgeschlagen (${res.status}): ${body}`)
  }
}

/** KFZ-144: Freien Relay-Seat finden (atomic locking) */
export async function findFreeRelaySeat(): Promise<{
  id: string; aircallUserId: number; aircallNumberId: number
} | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const db = createAdminClient()
  // Atomic: UPDATE ... WHERE belegt=false RETURNING * (nimmt den ersten freien)
  const { data } = await db.from('aircall_relay_seats')
    .update({ belegt: true, belegt_seit: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('aktiv', true).eq('belegt', false)
    .order('zuletzt_verwendet', { ascending: true, nullsFirst: true })
    .limit(1)
    .select('id, aircall_user_id, aircall_number_id')
    .single()
  if (!data) return null
  return { id: data.id, aircallUserId: Number(data.aircall_user_id), aircallNumberId: Number(data.aircall_number_id) }
}

/** KFZ-144: Relay-Seat freigeben */
export async function freeRelaySeat(relaySeatId: string): Promise<void> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const db = createAdminClient()
  await db.from('aircall_relay_seats').update({
    belegt: false, belegt_seit: null, belegt_call_id: null,
    zuletzt_verwendet: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', relaySeatId)
}

/** Webhook-Signatur prüfen */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.AIRCALL_WEBHOOK_TOKEN
  if (!secret) return false
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
