// AAR-472 C6: Shared Anthropic-Vision-Client.
//
// Zentraler Einstiegspunkt für Multimodal-Aufrufe (Bilder per URL). Konsumenten:
// - /api/vision/lead-analyse (AAR-472, Kunden-Flow Schritt 2b)
// - src/lib/unfallskizze/generate.ts (AAR-317, reine Text-Generierung
//   nutzt nur denselben Anthropic-Client — kein Bild-Input)
// - src/app/api/schadenkalkulation/route.ts (Legacy, bleibt vorerst mit eigenem
//   Client bis AAR-473 migriert)
//
// Modell-ID kommt aus AI_MODELS.vision_lead damit Upgrade ein Ein-Zeilen-Change
// in src/lib/ai/models.ts bleibt.
//
// Rückgabe `null`, wenn kein API-Key gesetzt ist — Consumer entscheiden ob sie
// 500 oder einen Fallback-Modus nutzen.

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'

export const VISION_MODEL = AI_MODELS.vision_lead

export function getAnthropicVisionClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return new Anthropic({ apiKey })
}

export function buildImageBlocks(
  urls: readonly string[],
  limit = 8,
): Anthropic.Messages.ImageBlockParam[] {
  return urls.slice(0, limit).map((url) => ({
    type: 'image' as const,
    source: { type: 'url' as const, url },
  }))
}
