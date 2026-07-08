// Shared Groq-Whisper-Transkription. Extrahiert aus /api/support/voice-transcribe
// (AAR-520), damit sowohl der Support-Endpoint als auch der token-authentifizierte
// FlowLink-Endpoint (/api/flow/voice-transcribe, Unfallhergang-Sprachdiktat) dieselbe
// Groq-Logik nutzen. KEIN Audio wird gespeichert — Blob rein, Transkript raus.

const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const GROQ_MODEL = 'whisper-large-v3-turbo'

export type TranscribeResult =
  | { ok: true; transcript: string }
  | { ok: false; status: number; error: string }

/**
 * Transkribiert ein Audio-Blob via Groq Whisper. Result-Object (kein throw),
 * damit Endpoints den HTTP-Status direkt durchreichen koennen.
 */
export async function transcribeAudio(
  audio: Blob,
  language: string = 'de',
): Promise<TranscribeResult> {
  if (audio.size === 0) {
    return { ok: false, status: 400, error: 'Keine Aufnahme erkannt.' }
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return { ok: false, status: 413, error: 'Audio zu groß (max. 10 MB)' }
  }

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    return { ok: false, status: 500, error: 'GROQ_API_KEY nicht konfiguriert' }
  }

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
      return {
        ok: false,
        status: 429,
        error: 'Spracherkennung ausgelastet, bitte kurz warten oder tippen',
      }
    }
    if (!groqRes.ok) {
      const bodyText = await groqRes.text().catch(() => '')
      console.error('[transcribe] Groq-Fehler', groqRes.status, bodyText)
      return { ok: false, status: 502, error: 'Spracherkennung vorübergehend nicht verfügbar' }
    }
    const json = (await groqRes.json()) as { text?: string }
    const transcript = (json.text ?? '').trim()
    if (!transcript) {
      return { ok: false, status: 422, error: 'Keine Sprache erkannt. Bitte erneut versuchen.' }
    }
    return { ok: true, transcript }
  } catch (err) {
    console.error('[transcribe] Groq-Call fehlgeschlagen:', err)
    return { ok: false, status: 502, error: 'Spracherkennung vorübergehend nicht verfügbar' }
  }
}
