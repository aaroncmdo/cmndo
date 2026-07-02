'use server'

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicVisionClient, buildImageBlocks } from '@/lib/ai/vision/client'
import { AI_MODELS } from '@/lib/ai/models'
import { logAiUsage } from '@/lib/ai/usage-log'
import { ladeAnspruchRates } from '@/lib/anspruch/rates'
import { berechneAnspruchsSpanne } from '@/lib/anspruch/positionen'
import {
  erstelleSession, ladeFotoInSession, ladeFotoUrls,
  speichereVisionResult, speicherePositionen,
} from '@/lib/anspruch/session'
import { SEGMENTE, type AnspruchSpanne, type Segment, type VisionResult } from '@/lib/anspruch/types'
import { createAdminClient } from '@/lib/supabase/admin'

const VISION_SYSTEM = `Du bist ein KFZ-Schadensexperte fuer den deutschen Markt. Antworte IMMER als valides JSON mit exakt diesem Schema, ohne weiteren Text:
{
  "beschaedigte_teile": ["string"],
  "schweregrad": "leicht" | "mittel" | "schwer",
  "segment": "kleinwagen" | "kompakt" | "mittelklasse" | "oberklasse" | "suv" | "transporter",
  "geschaetzte_kosten_min": number,
  "geschaetzte_kosten_max": number,
  "beschreibung": "string"
}
Schaetze Reparaturkosten als realistische BRUTTO-Spanne (deutsche Werkstattpreise). "segment" = Fahrzeugklasse aus dem sichtbaren Fahrzeug. Sei konservativ; bei Unsicherheit breitere Spanne.`

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

export async function starteAnspruchSession() {
  return erstelleSession()
}

export async function ladeSchadenfoto(
  sessionToken: string,
  formData: FormData,
): Promise<{ ok: true; anzahl: number } | { ok: false; error: string }> {
  const file = formData.get('foto')
  if (!(file instanceof File)) return { ok: false, error: 'Kein Foto' }
  if (!ALLOWED.has(file.type)) return { ok: false, error: 'Nur JPEG/PNG/WebP' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'Foto zu groß (max. 10 MB)' }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const bytes = await file.arrayBuffer()
  return ladeFotoInSession(sessionToken, { bytes, contentType: file.type, ext })
}

function parseVision(text: string): VisionResult | null {
  try {
    let t = text.trim()
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) t = fence[1].trim()
    if (!t.startsWith('{')) {
      const s = t.indexOf('{')
      const e = t.lastIndexOf('}')
      if (s !== -1 && e !== -1 && e > s) t = t.slice(s, e + 1)
    }
    const o = JSON.parse(t)
    if (!(SEGMENTE as readonly string[]).includes(o.segment)) o.segment = 'mittelklasse'
    if (!['leicht', 'mittel', 'schwer'].includes(o.schweregrad)) o.schweregrad = 'mittel'
    if (typeof o.geschaetzte_kosten_min !== 'number' || typeof o.geschaetzte_kosten_max !== 'number') return null
    if (!Array.isArray(o.beschaedigte_teile)) o.beschaedigte_teile = []
    else o.beschaedigte_teile = o.beschaedigte_teile.filter((t: unknown) => typeof t === 'string')
    if (typeof o.beschreibung !== 'string') o.beschreibung = ''
    return o as VisionResult
  } catch {
    return null
  }
}

export async function analysiereSchaden(
  sessionToken: string,
): Promise<{ ok: true; vision: VisionResult } | { ok: false; error: string }> {
  const client = getAnthropicVisionClient()
  if (!client) return { ok: false, error: 'Analyse aktuell nicht verfügbar' }
  const urls = await ladeFotoUrls(sessionToken)
  if (urls.length === 0) return { ok: false, error: 'Bitte zuerst mindestens ein Foto hochladen' }

  try {
    const response = await client.messages.create({
      model: AI_MODELS.vision_lead,
      max_tokens: 1024,
      system: VISION_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          ...buildImageBlocks(urls, 8),
          { type: 'text' as const, text: 'Analysiere diese KFZ-Schadenfotos und gib das JSON zurück.' },
        ] as Anthropic.Messages.ContentBlockParam[],
      }],
    })
    void logAiUsage({ endpoint: 'anspruch-pruefen/analyse', model: AI_MODELS.vision_lead, usage: response.usage })
    const text = response.content.find((b) => b.type === 'text')?.text ?? '{}'
    const vision = parseVision(text)
    if (!vision) {
      console.error('[anspruch] parseVision returned null; raw model head:', text.slice(0, 400))
      return { ok: false, error: 'Analyse fehlgeschlagen' }
    }
    await speichereVisionResult(sessionToken, vision)
    return { ok: true, vision }
  } catch (err) {
    console.error('[anspruch] vision error', err)
    return { ok: false, error: 'Analyse fehlgeschlagen' }
  }
}

export async function berechneAnspruch(
  sessionToken: string,
  eingabe: { segment: Segment; fahrbereit: boolean; ezJahr: number | null },
): Promise<{ ok: true; spanne: AnspruchSpanne } | { ok: false; error: string }> {
  const db = createAdminClient()
  const { data: row } = await db
    .from('anspruch_schaetzungen')
    .select('vision_result')
    .eq('session_token', sessionToken)
    .maybeSingle()
  const vision = row?.vision_result as VisionResult | null
  if (!vision) return { ok: false, error: 'Keine Analyse vorhanden' }

  const { saetze, faktoren, config } = await ladeAnspruchRates()
  const spanne = berechneAnspruchsSpanne(
    {
      reparaturMinEur: vision.geschaetzte_kosten_min,
      reparaturMaxEur: vision.geschaetzte_kosten_max,
      schweregrad: vision.schweregrad,
      segment: eingabe.segment,
      fahrbereit: eingabe.fahrbereit,
      ezJahr: eingabe.ezJahr,
      aktuellesJahr: new Date().getFullYear(),
    },
    saetze, faktoren, config,
  )
  await speicherePositionen(sessionToken, eingabe.segment, vision.schweregrad, eingabe.fahrbereit, eingabe.ezJahr, spanne.positionen)
  return { ok: true, spanne }
}
