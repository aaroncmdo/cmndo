'use client'

// 2026-05-07: ElevenLabs Text-to-Speech für TBT-Voice-Output.
// Aaron-Wunsch: schönere Stimme als Web Speech API.
//
// Free Tier: 10.000 Characters/Monat. Reichlich für TBT (jede Anweisung
// ist ~50 chars, 200 Anweisungen pro Termin = ~10k chars/Termin = 1
// Termin pro Monat im Free-Tier — Pro für reale Nutzung).
//
// API: POST /v1/text-to-speech/{voice_id}
//   - Auth: xi-api-key Header
//   - Body: { text, model_id?, voice_settings? }
//   - Response: audio/mpeg stream
//
// Cache: identische Texte werden oft wiederholt („Achtung Blitzer in 200
// Metern", „Geradeaus weiterfahren") — Module-Level Map cached den Audio-
// Blob pro Text-Hash damit ElevenLabs-Quota geschont wird.

const VOICE_ID_DEFAULT = 'EXAVITQu4vr4xnSDxMaL' // Sarah (warm, klar, deutsch fähig)
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/text-to-speech'

const audioCache = new Map<string, string>() // text → blob URL
let active: HTMLAudioElement | null = null

export function isElevenLabsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return !!process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY
}

/**
 * Spielt Text via ElevenLabs ab. Returns Promise<true> wenn erfolgreich,
 * false bei Fehler (Caller sollte dann auf Web-Speech-Fallback gehen).
 */
export async function speakViaElevenLabs(
  text: string,
  voiceId: string = VOICE_ID_DEFAULT,
): Promise<boolean> {
  if (!isElevenLabsEnabled()) return false
  const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY!

  try {
    let url = audioCache.get(text)
    if (!url) {
      const res = await fetch(`${ELEVENLABS_URL}/${voiceId}`, {
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
        console.warn('[elevenlabs] HTTP', res.status, await res.text().catch(() => ''))
        return false
      }
      const blob = await res.blob()
      url = URL.createObjectURL(blob)
      audioCache.set(text, url)
    }
    // Vorherige Audio stoppen damit Voices sich nicht überlagern
    if (active) {
      active.pause()
      active.src = ''
    }
    const audio = new Audio(url)
    active = audio
    await audio.play().catch((err) => {
      console.warn('[elevenlabs] play error:', err)
    })
    return true
  } catch (err) {
    console.warn('[elevenlabs] error:', err)
    return false
  }
}

export function stopElevenLabs(): void {
  if (active) {
    active.pause()
    active.src = ''
    active = null
  }
}
