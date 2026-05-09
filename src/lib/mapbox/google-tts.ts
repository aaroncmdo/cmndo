'use client'

// Google Cloud TTS Client-Modul.
// Gleiche Architektur wie elevenlabs-tts.ts: Browser callt unseren Proxy
// /api/google-tts, der den Google-API-Key server-side hält.
//
// Voice: de-DE-Neural2-F — neutrale weibliche Neural2-Stimme, klingt
// deutlich natürlicher als Web-Speech-API-Stimmen auf Windows/Android.
//
// Fallback-Kette in speakInstruction (turn-by-turn.ts):
//   Google TTS → ElevenLabs → Web Speech API

const audioCache = new Map<string, string>() // text → blob URL
let active: HTMLAudioElement | null = null
let googleTtsAvailable: boolean | null = null
const inFlight = new Map<string, Promise<boolean>>()

async function probeAvailability(): Promise<boolean> {
  if (googleTtsAvailable != null) return googleTtsAvailable
  try {
    const res = await fetch('/api/google-tts', {
      method: 'POST',
      body: JSON.stringify({ probe: true }),
      headers: { 'Content-Type': 'application/json' },
    })
    googleTtsAvailable = res.status !== 503 && res.status !== 401
    return googleTtsAvailable
  } catch {
    googleTtsAvailable = false
    return false
  }
}

export function isGoogleTtsEnabled(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Spielt Text via Google Cloud TTS (de-DE-Neural2-F) ab.
 * Returns true bei Erfolg, false bei Fehler (Caller fällt auf ElevenLabs/WebSpeech).
 */
export async function speakViaGoogleTts(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!(await probeAvailability())) return false

  const existing = inFlight.get(text)
  if (existing) return existing

  const p = (async (): Promise<boolean> => {
    try {
      let url = audioCache.get(text)
      if (!url) {
        const res = await fetch('/api/google-tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        const contentType = res.headers.get('content-type') ?? ''
        if (!res.ok || !contentType.startsWith('audio/')) {
          if (contentType.startsWith('application/json')) {
            const body = (await res.json().catch(() => null)) as { blocked?: boolean } | null
            if (body?.blocked) googleTtsAvailable = false
          }
          return false
        }
        const blob = await res.blob()
        url = URL.createObjectURL(blob)
        audioCache.set(text, url)
      }
      if (active) {
        active.pause()
        active.src = ''
      }
      const audio = new Audio(url)
      active = audio
      await audio.play().catch(() => { /* noop — autoplay-Policy */ })
      return true
    } catch {
      return false
    }
  })()

  inFlight.set(text, p)
  try {
    return await p
  } finally {
    inFlight.delete(text)
  }
}

export function stopGoogleTts(): void {
  if (active) {
    active.pause()
    active.src = ''
    active = null
  }
}
