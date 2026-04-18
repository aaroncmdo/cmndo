import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  VISION_MODEL,
  buildImageBlocks,
  getAnthropicVisionClient,
} from '@/lib/ai/vision/client'
import { visionResultSchema } from '@/lib/flow/schemas/vision-result'

// AAR-472 C6: POST /api/vision/lead-analyse
//
// Body: { leadId: string }
//
// 1. Lädt den Lead + die bereits hochgeladenen Fotos aus `leads.schadensfoto_urls`.
// 2. Schickt die URLs (max. 8) zusammen mit einem strukturierten System-Prompt
//    an Claude Sonnet 4.6 Vision.
// 3. Parst die JSON-Antwort mit Zod, speichert sie in `leads.claude_vision_analyse`.
// 4. Gibt das validierte Result an den Client zurück — AnalyseClient persistiert
//    es im Flow-Store für den nächsten Schritt (AAR-473, DAT-Call).
//
// Flow-Guard: leadId ist erforderlich, mindestens 3 Fotos müssen da sein — das
// wird in Schritt 2a (AAR-471) sichergestellt, hier noch einmal gegengeprüft.

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `Du bist ein KFZ-Schadens-Experte und analysierst Schadensfotos
für die Kunden-Ersteinschätzung. Antworte AUSSCHLIESSLICH mit einem validen JSON-
Objekt, ohne Markdown-Blöcke und ohne erklärenden Fließtext.

Schema (alle Felder sind Pflicht, nullable-Felder dürfen null sein):

{
  "beschaedigte_teile": string[],           // z.B. ["Stoßstange vorne", "Kotflügel links"]
  "schweregrad": "leicht" | "mittel" | "schwer",
  "schadentyp_vermutet": "auffahrunfall" | "spurwechsel" | "vorfahrtsverletzung"
    | "parkplatz" | "hagel" | "wildunfall" | "vandalismus" | "sonstiges" | null,
  "fahrzeug_hinweise": {
    "hersteller": string | null,
    "modell": string | null,
    "farbe": string | null,
    "kennzeichen": string | null
  } | null,
  "zusammenfassung": string,                 // 1-3 Sätze deutsch, für den Kunden lesbar
  "confidence": number                       // 0..1, wie sicher Du bei der Einschätzung bist
}

Wenn Du Dich bei einem Feld unsicher bist → null setzen, confidence senken. Erfinde
nichts. Schreibe alles auf Deutsch mit korrekten Umlauten.`

export async function POST(req: Request): Promise<Response> {
  let body: { leadId?: string }
  try {
    body = (await req.json()) as { leadId?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const leadId = body.leadId?.trim()
  if (!leadId) {
    return NextResponse.json({ error: 'leadId erforderlich' }, { status: 400 })
  }

  const anthropic = getAnthropicVisionClient()
  if (!anthropic) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY nicht konfiguriert' },
      { status: 500 },
    )
  }

  const supabase = createAdminClient()
  const { data: lead, error: loadErr } = await supabase
    .from('leads')
    .select(
      'id, schadensfoto_urls, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, schadens_hergang',
    )
    .eq('id', leadId)
    .single()

  if (loadErr || !lead) {
    return NextResponse.json(
      { error: 'Lead nicht gefunden' },
      { status: 404 },
    )
  }

  const urls = Array.isArray(lead.schadensfoto_urls)
    ? (lead.schadensfoto_urls as string[]).filter((u) => typeof u === 'string')
    : []
  if (urls.length < 3) {
    return NextResponse.json(
      { error: 'Mindestens 3 Fotos erforderlich' },
      { status: 400 },
    )
  }

  const kontext = [
    `Fahrzeug: ${lead.fahrzeug_hersteller ?? 'unbekannt'} ${lead.fahrzeug_modell ?? ''} ${lead.fahrzeug_baujahr ?? ''}`.trim(),
    lead.schadens_hergang ? `Hergang (vom Kunden): ${lead.schadens_hergang}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            ...buildImageBlocks(urls),
            {
              type: 'text',
              text: [
                'Analysiere diese Schadensfotos.',
                kontext || '(keine weiteren Kontext-Informationen)',
                'Antworte NUR mit dem JSON-Objekt aus dem System-Prompt.',
              ].join('\n\n'),
            },
          ],
        },
      ],
    })

    const text = response.content.find((b) => b.type === 'text')?.text ?? ''
    const json = extractJson(text)
    if (!json) {
      return NextResponse.json(
        { error: 'Claude hat kein valides JSON geliefert' },
        { status: 502 },
      )
    }

    const parsed = visionResultSchema.safeParse(json)
    if (!parsed.success) {
      console.error('[AAR-472] Vision-Schema-Fehler:', parsed.error.issues)
      return NextResponse.json(
        { error: 'Vision-Ergebnis entspricht nicht dem erwarteten Schema' },
        { status: 502 },
      )
    }

    const { error: updateErr } = await supabase
      .from('leads')
      .update({ claude_vision_analyse: parsed.data })
      .eq('id', leadId)

    if (updateErr) {
      console.error('[AAR-472] Lead-Update fehlgeschlagen:', updateErr)
      return NextResponse.json(
        { error: 'Konnte Analyse nicht speichern' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, result: parsed.data })
  } catch (err) {
    console.error('[AAR-472] Vision-Call fehlgeschlagen:', err)
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
    // Fallback: { ... } aus Fließtext extrahieren
  }
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}
