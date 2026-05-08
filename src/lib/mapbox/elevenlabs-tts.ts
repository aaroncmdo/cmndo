'use client'

// 2026-05-07: ElevenLabs Text-to-Speech via Server-Proxy.
// Aaron-Korrektur: ElevenLabs sk_-Prefix-Keys sind Secret-Keys → Server-
// Side-Only. Der Browser callt unsere Route /api/elevenlabs/tts statt
// direkt ElevenLabs.
//
// Server-Cache reduziert ElevenLabs-Quota (identische Anweisungen wie
// „Achtung Blitzer in 200 Metern" entstehen einmal, dann CDN-Cache).
// Client-Cache via Object-URL-Map: Blob-URL pro Text wird wiederverwendet
// bis Page-Reload.

const audioCache = new Map<string, string>() // text → blob URL
let active: HTMLAudioElement | null = null
let elevenLabsAvailable: boolean | null = null
// In-flight-Promises pro Text damit parallele speakInstruction-Calls
// (z.B. Blitzer 200m + 500m gleichzeitig) nur EINEN Network-Call machen.
// Race-condition fix 2026-05-08 — vorher haben parallel pending Calls
// alle ein 502 zurückbekommen bevor `elevenLabsAvailable=false` greifen
// konnte → Console-Spam.
const inFlight = new Map<string, Promise<boolean>>()

/**
 * Detect ob der Server ElevenLabs konfiguriert hat. Lazy-checked beim
 * ersten Call via HEAD/POST — danach gecached.
 */
async function probeAvailability(): Promise<boolean> {
  if (elevenLabsAvailable != null) return elevenLabsAvailable
  try {
    // 2026-05-08: Expliziter probe-Flag damit der Server bewusst zwischen
    // „Configuration-OK" und „nur leerer Body" unterscheidet.
    const res = await fetch('/api/elevenlabs/tts', {
      method: 'POST',
      body: JSON.stringify({ probe: true }),
      headers: { 'Content-Type': 'application/json' },
    })
    elevenLabsAvailable = res.status !== 503 && res.status !== 401
    if (!elevenLabsAvailable) {
      console.warn('[elevenlabs-client] probe failed, status', res.status)
    }
    return elevenLabsAvailable
  } catch (err) {
    console.warn('[elevenlabs-client] probe error:', err)
    elevenLabsAvailable = false
    return false
  }
}

export function isElevenLabsEnabled(): boolean {
  // Initial-Hinweis nur — die echte Verfügbarkeit zeigt der Server.
  return typeof window !== 'undefined'
}

/**
 * Spielt Text via ElevenLabs ab. Returns Promise<true> wenn erfolgreich,
 * false bei Fehler (Caller sollte dann auf Web-Speech-Fallback gehen).
 */
export async function speakViaElevenLabs(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!(await probeAvailability())) return false

  // 2026-05-08: In-flight-Dedup. Wenn dieselbe Anweisung parallel
  // angefragt wird (z.B. der gleiche Voice-Trigger feuert in zwei
  // Effekten gleichzeitig), nur einen Network-Call machen.
  const existing = inFlight.get(text)
  if (existing) return existing

  const p = (async () => {
    try {
      let url = audioCache.get(text)
      if (!url) {
        const res = await fetch('/api/elevenlabs/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        if (!res.ok) {
          console.warn('[elevenlabs-client] HTTP', res.status)
          // 503 vom Proxy = ElevenLabs hat Plan-/Quota-Issue (z.B. 402 von
          // ElevenLabs) → dauerhaft markieren damit kein weiterer Call
          // gemacht wird. Web-Speech-Fallback übernimmt. Auch bei 502 hart
          // disablen — wenn ein Voice-Call serverseitig fehlschlägt, sind
          // weitere höchstwahrscheinlich auch hin.
          if (res.status === 503 || res.status === 502 || res.status === 401) {
            elevenLabsAvailable = false
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
      await audio.play().catch((err) => {
        console.warn('[elevenlabs-client] play error:', err)
      })
      return true
    } catch (err) {
      console.warn('[elevenlabs-client] error:', err)
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

export function stopElevenLabs(): void {
  if (active) {
    active.pause()
    active.src = ''
    active = null
  }
}
