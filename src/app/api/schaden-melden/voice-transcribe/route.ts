import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import { voiceExtractionSchema } from '@/lib/flow/schemas/voice-extraction'

// AAR-470 C4: POST /api/schaden-melden/voice-transcribe
//
// FormData:
//  - audio: Blob (audio/webm, max 10 MB)
//  - language: 'de' | 'en' | 'tr' | 'pl' | 'ru' | 'ar'
//
// Ablauf:
//  1. Audio an Groq Whisper (whisper-large-v3-turbo, OpenAI-kompatibles Endpoint)
//  2. Transkript → Claude Sonnet 4.6 für Struktur-Extraktion
//  3. Zod-validiertes VoiceExtraction-Objekt zurück.
//
// Fehler-Pfade:
//  - GROQ_API_KEY fehlt → 500
//  - Groq 429 (Rate-Limit) → 429 durchreichen, Client-UI macht Fallback auf Tippen
//  - Groq 5xx → 502
//  - Claude invalid JSON → 502

export const dynamic = 'force-dynamic'

const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const GROQ_MODEL = 'whisper-large-v3-turbo'
const SUPPORTED_LANGUAGES = ['de', 'en', 'tr', 'pl', 'ru', 'ar'] as const
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const SYSTEM_PROMPT = `Du bist ein Experte für KFZ-Schadensberichte. Extrahiere aus
dem gesprochenen Transkript des Kunden strukturierte Daten. Wenn ein Feld nicht
erwähnt wurde, setze es auf null — rate nicht. Antworte AUSSCHLIESSLICH mit einem
JSON-Objekt nach diesem Schema (Umlaute in Strings bitte echt: ä/ö/ü/ß):

{
  "schadenhergang": string,                         // wörtlich aus dem Transkript zusammengefasst, max. 2000 Zeichen
  "unfall_datum": string | null,                    // ISO YYYY-MM-DD, null wenn nicht genannt
  "unfall_ort": string | null,                      // Stadt/Straße, null wenn nicht genannt
  "schuldfrage": "gegner" | "geteilt" | "selbst" | "unklar" | null,
  "schadentyp": "auffahrunfall" | "kreuzung" | "spurwechsel" | "parkschaden" | "wildunfall" | "sonstiges" | null,
  "polizei_vor_ort": boolean | null,
  "polizei_aktenzeichen": string | null
}

Kein Markdown, kein Fließtext — nur das JSON-Objekt.`

export async function POST(req: Request): Promise<Response> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY nicht konfiguriert' },
      { status: 500 },
    )
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY nicht konfiguriert' },
      { status: 500 },
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData erwartet' }, { status: 400 })
  }

  const audio = form.get('audio')
  const langRaw = form.get('language')
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: 'audio-Blob fehlt' }, { status: 400 })
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: 'Audio zu groß (max. 10 MB)' },
      { status: 413 },
    )
  }
  const language = (typeof langRaw === 'string' ? langRaw : 'de') as SupportedLanguage
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return NextResponse.json({ error: 'Sprache nicht unterstützt' }, { status: 400 })
  }

  // ─── Groq Whisper ────────────────────────────────────────────────────────
  const groqForm = new FormData()
  groqForm.set('file', audio, 'input.webm')
  groqForm.set('model', GROQ_MODEL)
  groqForm.set('language', language)
  groqForm.set('response_format', 'json')
  groqForm.set('temperature', '0')

  let transcript: string
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
      console.error('[AAR-470] Groq-Fehler', groqRes.status, bodyText)
      return NextResponse.json(
        { error: 'Spracherkennung vorübergehend nicht verfügbar' },
        { status: 502 },
      )
    }
    const json = (await groqRes.json()) as { text?: string }
    transcript = (json.text ?? '').trim()
  } catch (err) {
    console.error('[AAR-470] Groq-Call fehlgeschlagen:', err)
    return NextResponse.json(
      { error: 'Spracherkennung vorübergehend nicht verfügbar' },
      { status: 502 },
    )
  }

  if (!transcript) {
    return NextResponse.json(
      { error: 'Keine Sprache erkannt. Bitte erneut versuchen.' },
      { status: 422 },
    )
  }

  // ─── Claude Struktur-Extraktion ───────────────────────────────────────────
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey })
    const response = await anthropic.messages.create({
      model: AI_MODELS.voice_extract,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const textBlock = response.content.find((b) => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text : ''
    const parsedJson = extractJson(raw)
    if (!parsedJson) {
      return NextResponse.json(
        { error: 'Analyse des Transkripts fehlgeschlagen' },
        { status: 502 },
      )
    }
    const result = voiceExtractionSchema.safeParse(parsedJson)
    if (!result.success) {
      console.error('[AAR-470] Schema-Fehler:', result.error.issues)
      return NextResponse.json(
        { error: 'Struktur-Extraktion entspricht nicht dem Schema' },
        { status: 502 },
      )
    }
    return NextResponse.json({
      success: true,
      transcript,
      extraction: result.data,
    })
  } catch (err) {
    console.error('[AAR-470] Claude-Call fehlgeschlagen:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Claude-API-Fehler' },
      { status: 500 },
    )
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // Fallback unten
  }
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}
