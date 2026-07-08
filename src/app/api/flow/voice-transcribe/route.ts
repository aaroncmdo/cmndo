// Token-authentifizierter Voice-Transcribe fuer den FlowLink (Unfallhergang-Diktat).
// Der FlowLink-Kunde ist anonym (Magic-Link-Token, kein Login) -> Gate ueber den
// flow_links-Token statt Auth (analog resolveFlowLeadId in self-service-feststellung-
// actions.ts). Delegiert an transcribeAudio() (Groq Whisper). KEIN Audio wird gespeichert.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { transcribeAudio } from '@/lib/ai/transcribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// In-Process-IP-Rate-Limit (PM2-Single-Process, kein DB-Cost) gegen Groq-Kosten-
// Abuse dieses anonymen Endpoints — analog api/v1 (unauth-write-idor-audit-Lehre:
// anonyme Endpoints brauchen ein Rate-Limit). 60/min/IP: rolling re-transcribe
// sendet ~8-9/min pro Diktat -> mehrere gleichzeitige Diktate hinter einer IP ok,
// Abuse gedeckelt. Der check_gfa_rate_limit-RPC-Helper passt NICHT (niedrigfrequent
// + DB-Call pro Request -> wuerde legitimes Diktat blocken).
const RL_WINDOW_MS = 60_000
const RL_MAX = 60
const rlBuckets = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (rlBuckets.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS)
  if (recent.length >= RL_MAX) {
    rlBuckets.set(ip, recent)
    return true
  }
  recent.push(now)
  rlBuckets.set(ip, recent)
  return false
}

// Gueltiger, nicht abgelaufener flow_links-Token? (Strikter als resolveFlowLeadId:
// KEIN token=lead_id-Fallback — ein anonymer Transkriptions-Endpoint soll nur echten
// FlowLink-Tokens dienen, nicht beliebigen Lead-IDs.)
async function isValidFlowToken(token: string): Promise<boolean> {
  if (!token) return false
  const admin = createAdminClient()
  const { data } = await admin
    .from('flow_links')
    .select('expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!data) return false
  if (data.expires_at && new Date(data.expires_at as string).getTime() < Date.now()) return false
  return true
}

export async function POST(req: Request): Promise<Response> {
  // Rate-Limit zuerst (billig, in-process) — vor DB/Groq. Fail-open ohne IP
  // (Token-Gate bleibt der eigentliche Schutz; Rate-Limit = reine Kosten-Bremse).
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || ''
  if (ip && rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen, bitte kurz warten oder tippen' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData erwartet' }, { status: 400 })
  }

  const token = typeof form.get('token') === 'string' ? String(form.get('token')) : ''
  if (!(await isValidFlowToken(token))) {
    return NextResponse.json({ error: 'Ungültiger oder abgelaufener Link' }, { status: 403 })
  }

  const audio = form.get('audio')
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: 'audio-Blob fehlt' }, { status: 400 })
  }

  const language =
    typeof form.get('language') === 'string' ? String(form.get('language')) : 'de'

  const result = await transcribeAudio(audio, language)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ success: true, transcript: result.transcript })
}
