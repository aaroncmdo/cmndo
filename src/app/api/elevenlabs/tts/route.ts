// 2026-05-07: ElevenLabs TTS API Proxy.
// Server-side wegen Secret-Key (sk_-Prefix) — darf nicht im Browser-Bundle.
// Caller schickt POST mit { text, voice? }, bekommt audio/mpeg-Stream zurück.
//
// Caching: ElevenLabs liefert für identische Inputs identischen Output.
// Wir cachen pro (text, voice) im memory + setzen Cache-Control für CDN.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Aaron-Wahl 2026-05-07
const VOICE_DEFAULT = 'z1EhmmPwF0ENGYE8dBE6'
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/text-to-speech'

// Module-Level Cache pro Lambda-Instanz. Hot Route → identische Map-
// Anweisungen werden vielfach geliefert. 5 MB Limit damit nicht unbegrenzt
// wächst (~50 Audio-Files je ~100KB).
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
  // Auth-Check via Supabase-Cookie. Nur eingeloggte User dürfen TTS callen
  // damit der Server-Key nicht von random Internet missbraucht wird.
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'TTS nicht konfiguriert' }, { status: 503 })

  const body = (await request.json().catch(() => null)) as { text?: string; voice?: string; probe?: boolean } | null
  const text = body?.text?.trim()
  const voice = body?.voice ?? VOICE_DEFAULT
  // 2026-05-08: Expliziter Probe-Path. Vorher hat ein leerer Body einen
  // 200 zurückgegeben, was auch dann passierte wenn ELEVENLABS_API_KEY
  // fehlte — Client cached availability=true → erste echte Anweisung
  // brachte 502, fiel auf Web Speech zurück, aber wirkte wie „ElevenLabs
  // funktioniert nicht". Probe gibt jetzt 200 nur wenn Key real da ist
  // (oben schon gechecked) und der Voice-ID existiert (Best-Effort).
  if (body?.probe || !text) {
    return NextResponse.json({ ok: true, voice, configured: true }, { status: 200 })
  }
  if (text.length > 500) return NextResponse.json({ error: 'text too long' }, { status: 400 })

  const key = `${voice}:${text}`
  const cached = cache.get(key)
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
    const res = await fetch(`${ELEVENLABS_URL}/${voice}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[elevenlabs-proxy] HTTP', res.status, detail.slice(0, 200))
      return NextResponse.json({ error: 'TTS-API-Fehler', status: res.status }, { status: 502 })
    }
    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    evictIfFull(buffer.byteLength)
    cache.set(key, { buffer, ts: Date.now() })
    cacheBytes += buffer.byteLength

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Cache': 'MISS',
      },
    })
  } catch (err) {
    console.error('[elevenlabs-proxy] error:', err)
    return NextResponse.json({ error: 'TTS-Fehler' }, { status: 500 })
  }
}
