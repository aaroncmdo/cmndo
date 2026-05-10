// Google Cloud Text-to-Speech Proxy.
// Server-Side wegen API-Key — darf nicht im Browser-Bundle.
// Voice: de-DE-Neural2-F (weiblich, neutral) — klingt natürlicher als
// Web-Speech-API-Stimmen auf Windows/Android.
//
// Caching: identische Texte liefern identisches Audio → 24h-Cache im
// Modul + Cache-Control für CDN. Gleiche Architektur wie ElevenLabs-Proxy.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize'
const VOICE_NAME = process.env.GOOGLE_TTS_VOICE ?? 'de-DE-Neural2-F'
const LANGUAGE_CODE = 'de-DE'

const cache = new Map<string, { buffer: Buffer; ts: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_MAX_BYTES = 5 * 1024 * 1024
let cacheBytes = 0

function evictIfFull(addBytes: number): void {
  while (cacheBytes + addBytes > CACHE_MAX_BYTES && cache.size > 0) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (!oldest) break
    cacheBytes -= oldest[1].buffer.byteLength
    cache.delete(oldest[0])
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const apiKey = process.env.GOOGLE_TTS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'TTS nicht konfiguriert' }, { status: 503 })

  const body = (await request.json().catch(() => null)) as { text?: string; probe?: boolean } | null

  if (body?.probe || !body?.text?.trim()) {
    return NextResponse.json({ ok: true, voice: VOICE_NAME, configured: true })
  }

  const text = body.text.trim()
  if (text.length > 500) return NextResponse.json({ error: 'text too long' }, { status: 400 })

  const cacheKey = `${VOICE_NAME}:${text}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return new NextResponse(cached.buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Cache': 'HIT',
      },
    })
  }

  try {
    const res = await fetch(`${GOOGLE_TTS_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: LANGUAGE_CODE, name: VOICE_NAME },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 0.95,
          pitch: 0.0,
          volumeGainDb: 1.0,
        },
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[google-tts-proxy] HTTP', res.status, detail.slice(0, 200))
      return NextResponse.json(
        { ok: false, blocked: true, status: res.status },
        { status: 200, headers: { 'Cache-Control': 'private, max-age=300' } },
      )
    }

    const data = (await res.json()) as { audioContent?: string }
    if (!data.audioContent) {
      return NextResponse.json({ ok: false, blocked: true }, { status: 200 })
    }

    const buffer = Buffer.from(data.audioContent, 'base64')
    evictIfFull(buffer.byteLength)
    cache.set(cacheKey, { buffer, ts: Date.now() })
    cacheBytes += buffer.byteLength

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Cache': 'MISS',
      },
    })
  } catch (err) {
    console.error('[google-tts-proxy] error:', err)
    return NextResponse.json({ error: 'TTS-Fehler' }, { status: 500 })
  }
}
