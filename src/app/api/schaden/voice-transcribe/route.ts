// Token-authentifizierter Voice-Transcribe fuer den Gegner-Schaden-Flow (/schaden/[token]).
// Der Unfallgegner ist anonym (Schadenkarte-Token, kein Login) -> Gate ueber
// resolveSchadenTokenContext (validiert den karten_token -> Fahrzeug/Firma), analog zum
// FlowLink-Pendant api/flow/voice-transcribe (das gegen flow_links gated). Delegiert an
// transcribeAudio (Groq Whisper). KEIN Audio wird gespeichert.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSchadenTokenContext } from '@/lib/schadenkarte/gegner-flow'
import { transcribeAudio } from '@/lib/ai/transcribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// In-Process-IP-Rate-Limit gegen Groq-Kosten-Abuse dieses anonymen Endpoints (analog
// api/flow/voice-transcribe). 60/min/IP: rolling re-transcribe sendet ~8-9/min pro Diktat.
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

export async function POST(req: Request): Promise<Response> {
  // Rate-Limit zuerst (billig, in-process) — vor DB/Groq. Token-Gate bleibt der eigentliche Schutz.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    ''
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
  const ctx = await resolveSchadenTokenContext(createAdminClient(), token)
  if (!ctx.ok) {
    return NextResponse.json({ error: 'Ungültige oder abgelaufene Schadenkarte' }, { status: 403 })
  }

  const audio = form.get('audio')
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: 'audio-Blob fehlt' }, { status: 400 })
  }

  const language = typeof form.get('language') === 'string' ? String(form.get('language')) : 'de'

  const result = await transcribeAudio(audio, language)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ success: true, transcript: result.transcript })
}
