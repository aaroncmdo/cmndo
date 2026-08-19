import Anthropic from '@anthropic-ai/sdk'
import { ContentScriptSchema, type ContentScript, type ContentFormat } from './schema'

/**
 * Skript-Generator: Thema + Format -> validiertes Skript + Visual-Plan.
 * Port des validierten PoC (scripts/marketing-poc/lib/script.mjs v2, umlaut+prefer-stock).
 * Tool-Use erzwingt sauberes JSON; ContentScriptSchema validiert das Ergebnis.
 * `client` ist injizierbar (Tests mocken den Anthropic-Client).
 */

const MODEL = 'claude-opus-4-8'
/** Als Konstante, damit die Abbruch-Meldung unten denselben Wert nennt wie der
 *  Aufruf — sonst laufen Limit und Fehlertext beim naechsten Anheben auseinander. */
const MAX_TOKENS = 1500

const TOOL: Anthropic.Tool = {
  name: 'liefere_clip',
  description: 'Liefert Skript + Visual-Plan fuer einen deutschen 9:16-Kurzclip.',
  input_schema: {
    type: 'object',
    required: ['hook', 'segmente', 'caption', 'hashtags'],
    properties: {
      hook: { type: 'string', description: 'Der Hook-Satz - identisch zum Text des ERSTEN Segments (wird zuerst gesprochen).' },
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
                tags: { type: 'array', items: { type: 'string' } },
                queries: { type: 'array', items: { type: 'string' }, description: 'Konkrete ENGLISCHE Pexels-Suchbegriffe.' },
              },
            },
          },
        },
      },
      caption: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' } },
      disclaimer: { type: 'string' },
      musik_stimmung: {
        type: 'string',
        enum: ['ruhig', 'dringlich', 'aufbauend', 'serioes'],
        description: 'Stimmung des Hintergrund-Musikbetts, passend zum Clip (ruhig=informativ, dringlich=Warnung/Zeitdruck, aufbauend=Loesung/Hoffnung, serioes=sachlich).',
      },
    },
  },
}

const SYSTEM = `Du schreibst deutsche Kurzvideo-Skripte fuer Claimondo (KFZ-Gutachter / Unfallschaden-Abwicklung).
Aufbau (Pflicht):
- Das ERSTE Segment ist der Hook: ein Scroll-Stopper fuer die ersten 2 Sekunden (Frage oder starke, konkrete Aussage), der genau dieses Video verspricht. Er wird zuerst gesprochen; das Feld "hook" wiederholt exakt diesen Satz.
- Mittelteil: 2-4 Segmente, je GENAU EINE Aussage bzw. ein Tipp, 6-14 Woerter, punchy - keine Schachtelsaetze (die Captions zeigen immer nur eine kurze Phrase).
- Das LETZTE Segment schliesst ab - die Format-Vorgabe dazu steht in der Nutzer-Nachricht.
Regeln:
- Ziel-Dauer 30-60s: insgesamt 3-6 gesprochene Saetze.
- ECHTE deutsche Umlaute: alle Texte (text, on_screen_text, caption, hashtags) IMMER mit ä/ö/ü/ß, NIEMALS ae/oe/ue/ss. Richtig: "Schäden", "größeren", "unabhängiger", "Überblick". Pflicht - auch fuer die gesprochenen Saetze (sonst spricht die Stimme falsch).
- KEINE Rechtsberatung. Bei Versicherungs-/Rechtsthemen vorsichtig-allgemein formulieren + kurzen Disclaimer setzen.
- Ton: vertrauensvoll und klar (kein Clickbait-Trash) - der Hook darf zuspitzen, der Rest bleibt serioes.
- Visual-Plan pro Segment - BEVORZUGE 'stock', fast alles laesst sich bebildern:
  * typ 'stock' + 3 konkrete ENGLISCHE, visuell eindeutige queries. Bsp: "Unfallstelle sichern" -> ["hazard warning triangle on road","car hazard lights flashing","breakdown roadside safety"]; "Fotos machen" -> ["person photographing car damage with smartphone","documenting car accident on phone"].
  * typ 'grafik' NUR fuer voellig abstrakte Begriffe ohne moegliches Bild (Frist, Prozent, Anspruch).
  * typ 'marke' fuer ikonisch/gebrandet (Warndreieck, Kennzeichen, Logo) mit tags.
- on_screen_text: knackiges Overlay, max 5 Woerter, echte Umlaute - eine VERSTAERKUNG, nicht wortgleich zum gesprochenen Satz.
- musik_stimmung: waehle die zum Clip passende Stimmung fuers leise Hintergrund-Bett (ruhig / dringlich / aufbauend / serioes).`

export async function generiereSkript(
  thema: string,
  format: ContentFormat,
  client?: Anthropic,
): Promise<ContentScript> {
  const anthropic = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const modus =
    format === 'ad'
      ? 'Werbeclip. Bogen: Hook (Problem/Schmerzpunkt) -> warum das teuer oder riskant wird -> wie Claimondo es loest. LETZTES Segment = klarer Call-to-Action (z.B. "Jetzt kostenlos pruefen lassen").'
      : 'Ratgeber-Clip, aufklaerend, Mehrwert zuerst. Bogen: Hook (Frage oder haeufiger Fehler) -> 2-3 konkrete Schritte/Tipps. LETZTES Segment = praegnantes Fazit. Kein harter Verkauf.'
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'liefere_clip' },
    messages: [{ role: 'user', content: `Thema: "${thema}". Format: ${modus}` }],
  })
  // Reisst die Antwort das Token-Limit, liefert die API einen unvollstaendigen
  // tool_use-Block. Hier faellt das immerhin auf — `ContentScriptSchema.parse`
  // wirft. Aber es wirft als Schema-Verstoss, und wer den Fehler liest, sucht
  // den Bug im Prompt statt am Limit. Die explizite Meldung spart diese Runde.
  //
  // (Anders als bei flow-intake/extract, wo Fallbacks den Abbruch STILL
  // verschluckten — siehe BROADCAST-anthropic-stop-reason-nie-geprueft.)
  if (res.stop_reason === 'max_tokens') {
    throw new Error(
      `Claude-Antwort am Token-Limit abgeschnitten (max_tokens=${MAX_TOKENS}) — Skript unvollstaendig`,
    )
  }

  const call = res.content.find((c) => c.type === 'tool_use')
  if (!call || call.type !== 'tool_use') throw new Error('Kein tool_use in Claude-Antwort')
  return ContentScriptSchema.parse(call.input)
}
