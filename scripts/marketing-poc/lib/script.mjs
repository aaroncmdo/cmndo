// Claude Opus: Thema + Format -> Skript + Visual-Plan (Tool-Use erzwingt sauberes JSON)
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TOOL = {
  name: 'liefere_clip',
  description: 'Liefert Skript + Visual-Plan fuer einen deutschen 9:16-Kurzclip.',
  input_schema: {
    type: 'object',
    required: ['hook', 'segmente', 'caption', 'hashtags'],
    properties: {
      hook: { type: 'string', description: 'Aufmerksamkeits-Hook, 1 Satz.' },
      segmente: {
        type: 'array',
        minItems: 3,
        maxItems: 7,
        items: {
          type: 'object',
          required: ['text', 'visual'],
          properties: {
            text: { type: 'string', description: 'Gesprochener Satz (Voiceover), kurz.' },
            on_screen_text: { type: 'string', description: 'Kurzes Overlay, max 5 Woerter.' },
            visual: {
              type: 'object',
              required: ['typ'],
              properties: {
                typ: { type: 'string', enum: ['marke', 'stock', 'grafik'] },
                tags: { type: 'array', items: { type: 'string' }, description: 'Tags fuer Marken-Bibliothek (z.B. warndreieck, kennzeichen).' },
                queries: { type: 'array', items: { type: 'string' }, description: 'Konkrete ENGLISCHE Pexels-Suchbegriffe, visuell eindeutig.' },
              },
            },
          },
        },
      },
      caption: { type: 'string', description: 'Post-Caption (Deutsch).' },
      hashtags: { type: 'array', items: { type: 'string' } },
      disclaimer: { type: 'string', description: 'Kurzer Disclaimer bei Rechts-/Versicherungsthemen.' },
    },
  },
}

const SYSTEM = `Du schreibst deutsche Kurzvideo-Skripte fuer Claimondo (KFZ-Gutachter / Unfallschaden-Abwicklung).
Regeln:
- Ziel-Dauer 30-60s: 3-6 kurze, gesprochene Saetze.
- ECHTE deutsche Umlaute: alle Texte (text, on_screen_text, caption, hashtags) IMMER mit ä/ö/ü/ß, NIEMALS ae/oe/ue/ss. Richtig: "Schäden", "größeren", "unabhängiger", "Überblick". Pflicht — auch fuer die gesprochenen Saetze (sonst spricht die Stimme falsch).
- KEINE Rechtsberatung. Bei Versicherungs-/Rechtsthemen vorsichtig-allgemein formulieren + kurzen Disclaimer setzen.
- Vertrauensvoller, klarer Ton (kein Clickbait-Trash).
- Visual-Plan pro Segment — BEVORZUGE 'stock', fast alles laesst sich bebildern:
  * typ 'stock' + 3 konkrete ENGLISCHE, visuell eindeutige queries. Bsp: "Unfallstelle sichern" -> ["hazard warning triangle on road","car hazard lights flashing","breakdown roadside safety"]; "Fotos machen" -> ["person photographing car damage with smartphone","documenting car accident on phone","close up dented car bumper"].
  * typ 'grafik' NUR fuer voellig abstrakte Begriffe ohne moegliches Bild (Frist, Prozent, Anspruch).
  * typ 'marke' fuer ikonisch/gebrandet (Warndreieck, Kennzeichen, Logo) mit tags.
- on_screen_text: knackiges Overlay, max 5 Woerter, mit echten Umlauten.`

export async function generateScript(thema, format) {
  const modus =
    format === 'ad'
      ? 'Werbeclip mit klarem Call-to-Action am Ende.'
      : 'Ratgeber-Clip, aufklaerend, Mehrwert zuerst.'
  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1500,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'liefere_clip' },
    messages: [{ role: 'user', content: `Thema: "${thema}". Format: ${modus}` }],
  })
  const call = res.content.find((c) => c.type === 'tool_use')
  if (!call) throw new Error('Kein tool_use in Claude-Antwort')
  return call.input
}
