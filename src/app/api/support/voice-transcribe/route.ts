// AAR-520 (S3): Thin Voice-Transcribe-Endpoint für den Support-Bot.
//
// Im Gegensatz zu /api/schaden-melden/voice-transcribe (AAR-470) machen wir
// hier KEINE Claude-Struktur-Extraktion — der Support-Bot will nur den
// rohen Transkript-Text, um ihn ins Chat-Feld einzufügen. Claude läuft
// dann erst im Support-Chat-Flow.
//
// FormData:
//   audio   Blob (audio/webm, max 10 MB)
//   language  'de' (default, Rest wäre über AAR-470 später nachrüstbar)
//
// Auth: nur eingeloggte SV/Admin/Kundenbetreuer, analog /api/support/chat.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const GROQ_MODEL = 'whisper-large-v3-turbo'
const ALLOWED_ROLES = new Set(['sachverstaendiger', 'admin', 'kundenbetreuer'])

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !ALLOWED_ROLES.has(profile.rolle ?? '')) {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY nicht konfiguriert' }, { status: 500 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData erwartet' }, { status: 400 })
  }

  const audio = form.get('audio')
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: 'audio-Blob fehlt' }, { status: 400 })
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio zu groß (max. 10 MB)' }, { status: 413 })
  }

  const language = typeof form.get('language') === 'string'
    ? String(form.get('language'))
    : 'de'

  const groqForm = new FormData()
  groqForm.set('file', audio, 'input.webm')
  groqForm.set('model', GROQ_MODEL)
  groqForm.set('language', language)
  groqForm.set('response_format', 'json')
  groqForm.set('temperature', '0')

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: groqForm,
    })
    if (groqRes.status === 429) {
      return NextResponse.json(
        { error: 'Spracherkennung ausgelastet, bitte kurz warten oder tippen' },
        { status: 429 },
      )
    }
    if (!groqRes.ok) {
      const bodyText = await groqRes.text().catch(() => '')
      console.error('[AAR-520] Groq-Fehler', groqRes.status, bodyText)
      return NextResponse.json(
        { error: 'Spracherkennung vorübergehend nicht verfügbar' },
        { status: 502 },
      )
    }
    const json = (await groqRes.json()) as { text?: string }
    const transcript = (json.text ?? '').trim()
    if (!transcript) {
      return NextResponse.json(
        { error: 'Keine Sprache erkannt. Bitte erneut versuchen.' },
        { status: 422 },
      )
    }
    return NextResponse.json({ success: true, transcript })
  } catch (err) {
    console.error('[AAR-520] Groq-Call fehlgeschlagen:', err)
    return NextResponse.json(
      { error: 'Spracherkennung vorübergehend nicht verfügbar' },
      { status: 502 },
    )
  }
}
