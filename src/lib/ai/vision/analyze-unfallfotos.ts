// AAR-unfallfotos: Haiku-Vision-Auswertung der Unfallfotos aus dem
// Dispatch-Lead-Flow Step 4.
//
// Ablauf:
//   1. Kunde lädt Unfallfotos via /upload/dokumente/[token] hoch (Multi-File-Slot)
//   2. Nach jedem Upload: URL wird an leads.schadensfoto_urls (jsonb) angehängt
//   3. Haiku 4.5 liest alle bisherigen Fotos + gibt eine knappe, sachliche
//      Schaden-am-Auto-Beschreibung (2-3 Sätze) zurück
//   4. Ergebnis wird in leads.sachschaden_beschreibung gespeichert
//
// Wichtig: Nur Fahrzeug-Schaden beschreiben — NICHT den Unfallhergang. Das
// Unfallhergang-Feld (leads.schadens_hergang) wird in Phase 1/Hard-Gate
// getrennt erfasst.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from '@/lib/ai/models'

const MODEL = AI_MODELS.vision_schadenbeschreibung
const MAX_FOTOS = 8

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return new Anthropic({ apiKey })
}

/**
 * Fügt eine Foto-URL an leads.schadensfoto_urls an und triggert danach die
 * Haiku-Analyse mit allen bisherigen Fotos. Fire-and-forget — Caller sollte
 * den Rückgabewert nicht awaiten blocking, aber catch() für Logging anbringen.
 */
export async function appendUnfallfotoAndAnalyze(
  leadId: string,
  fotoUrl: string,
): Promise<void> {
  const db = createAdminClient()

  const { data: lead } = await db
    .from('leads')
    .select('id, schadensfoto_urls, sachschaden_beschreibung')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) {
    console.warn('[AAR-unfallfotos] Lead nicht gefunden:', leadId)
    return
  }

  const existing = Array.isArray(lead.schadensfoto_urls)
    ? (lead.schadensfoto_urls as string[])
    : []
  const next = existing.includes(fotoUrl) ? existing : [...existing, fotoUrl]

  await db
    .from('leads')
    .update({ schadensfoto_urls: next, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  // Nur (neu) analysieren, wenn mindestens 1 Foto vorhanden ist
  if (next.length === 0) return

  const beschreibung = await analyzeFotosToBeschreibung(next.slice(0, MAX_FOTOS))
  if (!beschreibung) return

  await db
    .from('leads')
    .update({
      sachschaden_beschreibung: beschreibung,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
}

async function analyzeFotosToBeschreibung(urls: string[]): Promise<string | null> {
  const client = getClient()
  if (!client) {
    console.warn('[AAR-unfallfotos] ANTHROPIC_API_KEY fehlt')
    return null
  }

  const images: Anthropic.Messages.ImageBlockParam[] = urls.map((url) => ({
    type: 'image',
    source: { type: 'url', url },
  }))

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system:
        'Du bist ein KFZ-Schadengutachter-Assistent. Beschreibe auf Deutsch in 2-4 Sätzen ausschließlich die sichtbaren Fahrzeugschäden auf den Fotos. Fokus: welche Bauteile sind beschädigt, welche Art Schaden (Delle, Kratzer, Riss, Lackabplatzung, Deformation, Glasbruch). KEINE Spekulation über Unfallhergang, Schuldfrage oder Wert. Sachlich, nüchtern, ohne Floskeln. Wenn Fotos unscharf oder Schaden nicht erkennbar: schreibe stattdessen „Schaden auf Foto nicht eindeutig erkennbar — manuelle Nachfrage nötig.".',
      messages: [
        {
          role: 'user',
          content: [
            ...images,
            {
              type: 'text',
              text: 'Beschreibe die sichtbaren Fahrzeugschäden. Nur was am Auto kaputt ist — nicht wie der Unfall passiert ist.',
            },
          ],
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return null
    const text = textBlock.text.trim()
    if (text.length < 10) return null
    return text
  } catch (err) {
    console.error('[AAR-unfallfotos] Haiku-Request-Fehler:', err)
    return null
  }
}
