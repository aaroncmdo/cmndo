// Z3 (Foto-Qualitaets-Ampel): bewertet pro Zustandsdoku-Foto, WIE GUT es fuer die
// Schadenerkennung nutzbar ist (Schaerfe/Belichtung/Winkel/Abstand/Vollstaendigkeit)
// -> Prozent 0-100 + optionaler Kurz-Hinweis. Fail-safe wie zustand-scan-ki.ts:
// Client null / Fehler / Parse-Fehler -> null (nicht bewertet, KEINE falsche Warnung).
import { getAnthropicVisionClient, buildImageBlocks } from '@/lib/ai/vision/client'
import { AI_MODELS } from '@/lib/ai/models'
import { PERSPEKTIVE_LABEL } from '@/lib/vehicles/zustand-perspektiven'

export type FotoQualitaet = { prozent: number; hinweis: string | null }
export type QualitaetAmpel = 'gruen' | 'amber' | 'rot'

/** Ampel aus dem Score. Schwellen (Aaron 22.07.): gruen >=75, amber 50-74, rot <50. */
export function ampelAusProzent(prozent: number): QualitaetAmpel {
  if (prozent >= 75) return 'gruen'
  if (prozent >= 50) return 'amber'
  return 'rot'
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** Pure, tolerant: erstes JSON-Objekt -> { prozent, hinweis }. Malformed / kein prozent -> null. */
export function parseQualitaet(text: string): FotoQualitaet | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  let parsed: { prozent?: unknown; hinweis?: unknown }
  try {
    parsed = JSON.parse(m[0])
  } catch {
    return null
  }
  const roh = Number(parsed?.prozent)
  if (!Number.isFinite(roh)) return null
  const prozent = Math.round(clamp(roh, 0, 100))
  const hinweisRaw = typeof parsed?.hinweis === 'string' ? parsed.hinweis.trim() : ''
  return { prozent, hinweis: hinweisRaw.length > 0 ? hinweisRaw : null }
}

const SYSTEM =
  'Sie bewerten, wie gut ein Fahrzeugfoto fuer die KFZ-Schadenerkennung nutzbar ist — NICHT ob ein Schaden vorliegt. Kriterien: Schaerfe, Belichtung, Winkel, Abstand, Vollstaendigkeit der geforderten Perspektive.'

/**
 * Fail-safe Vision-Call: bewertet EIN Foto. Kein Client / Fehler -> null.
 * @param url  signierte Storage-URL des Fotos (wie analysiereFotos).
 */
export async function bewerteFotoQualitaet(url: string, perspektive: string): Promise<FotoQualitaet | null> {
  const client = getAnthropicVisionClient()
  if (!client || !url) return null
  const label = PERSPEKTIVE_LABEL[perspektive] ?? perspektive
  try {
    const res = await client.messages.create({
      model: AI_MODELS.vision_schadenbeschreibung,
      max_tokens: 200,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            ...buildImageBlocks([url], 1),
            {
              type: 'text' as const,
              text: `Geforderte Perspektive: ${label}. Bewerte NUR die Nutzbarkeit fuer die Schadenerkennung. Antworte NUR JSON: {"prozent": 0-100, "hinweis": "kurzer Grund bei <75, sonst leerer String"}. 100 = perfekt nutzbar (scharf, hell, richtiger Winkel), 0 = unbrauchbar (verwackelt/dunkel/falscher Ausschnitt).`,
            },
          ],
        },
      ],
    })
    const textBlock = res.content.find((c) => c.type === 'text')
    const text = textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : ''
    return parseQualitaet(text)
  } catch {
    return null
  }
}
