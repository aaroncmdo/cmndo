import 'server-only'

// Claude-Generierung hyperlokaler Ortsinhalte fuer /kfz-gutachter/[stadt].
//
// Tool-Use statt Text-Parsing: die Ausgabe ist strukturiert (Bezirke, Achsen,
// Hotspots, FAQs), also erzwingen wir das Schema ueber `tool_choice` — anders als
// bei den Wissen-Artikeln, wo ein langer Markdown-Body separat uebertragen wird.
//
// Das Ergebnis geht NIE direkt in die Veroeffentlichung. Der Caller schickt es
// durch `pruefeLokalinhalt` (gate.ts) und legt es als status='in_review' ab.
// Zwei Sicherungen also: der Prompt bittet um Belege, das Gate erzwingt sie.
// Auf den Prompt allein darf man sich nicht verlassen — ein Modell, das keine
// echte Quelle kennt, erfindet im Zweifel eine plausible.

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import type { LokalinhaltEntwurf } from './gate'

export const LOKALINHALT_MODEL = AI_MODELS.sv_briefing_struktur
const MAX_OUTPUT_TOKENS = 4096

/** Verifizierte Fakten, die die Seite bereits traegt — als Kontext in den Prompt. */
export type StadtKontext = {
  name: string
  bundesland: string
  plzPrefix: string
  bevoelkerung: string
  amtsgericht: string
  landgericht: string
  /** Geografisch naechste Stadt-Pages (aus naechsteStaedte) — verhindert Fantasie-Nachbarn. */
  nachbarorte: string[]
}

const TOOL: Anthropic.Tool = {
  name: 'erfasse_ortsinhalt',
  description: 'Liefert die recherchierten hyperlokalen Angaben zu einer Stadt.',
  input_schema: {
    type: 'object',
    properties: {
      stadtbezirke: {
        type: 'array',
        description: 'Amtliche Stadtbezirke/Stadtteile. Leer lassen, wenn unsicher.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            ortsteile: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'ortsteile'],
        },
      },
      hauptachsen: {
        type: 'object',
        description: 'Verkehrsachsen, die die Stadt erschliessen.',
        properties: {
          autobahnen: { type: 'array', items: { type: 'string' } },
          bundesstrassen: { type: 'array', items: { type: 'string' } },
          knoten: { type: 'array', items: { type: 'string' } },
        },
        required: ['autobahnen', 'bundesstrassen', 'knoten'],
      },
      unfallHotspots: {
        type: 'array',
        description:
          'NUR mit belegbarer Quell-URL. Ohne echte Quelle: Eintrag WEGLASSEN, niemals eine URL erfinden.',
        items: {
          type: 'object',
          properties: {
            ort: { type: 'string' },
            beschreibung: { type: 'string' },
            quelle: { type: 'string', description: 'Absolute http(s)-URL der Fundstelle.' },
            einzelfall: {
              type: 'boolean',
              description: 'true = dokumentierter Einzelvorfall, false = aggregierter Schwerpunkt.',
            },
          },
          required: ['ort', 'beschreibung', 'quelle', 'einzelfall'],
        },
      },
      lokaleFaqs: {
        type: 'array',
        description: 'Ortsspezifische Fragen. Nichts, was auf jeder Stadtseite stehen koennte.',
        items: {
          type: 'object',
          properties: { frage: { type: 'string' }, antwort: { type: 'string' } },
          required: ['frage', 'antwort'],
        },
      },
      heroAnker: { type: 'string', description: 'Ein Satz mit konkretem Ortsbezug. Optional.' },
      topografieAnker: { type: 'string', description: 'Lagebesonderheit. Optional.' },
    },
    required: ['stadtbezirke', 'hauptachsen', 'unfallHotspots', 'lokaleFaqs'],
  },
}

function systemPrompt(): string {
  return [
    'Du recherchierst hyperlokale Fakten fuer die Standortseite eines Kfz-Gutachter-Dienstes.',
    '',
    'OBERSTE REGEL — Belege:',
    '- Unfallschwerpunkte NUR mit echter, absoluter http(s)-Quell-URL (Polizeipresse, Stadt, Unfallatlas).',
    '- Kennst du keine echte Quelle: lass den Eintrag WEG. Ein leeres Feld ist richtig, eine erfundene URL ist ein Schaden.',
    '- Erfinde NIEMALS eine URL, auch keine plausibel aussehende. Keine Platzhalter wie example.com.',
    '- Nenne KEINE Statistiken oder Zahlen, die du nicht belegen kannst.',
    '',
    'Inhaltliche Regeln:',
    '- Alles muss extern ueberpruefbar sein: amtliche Stadtbezirke, tatsaechlich vorhandene Autobahnen/Bundesstrassen.',
    '- Bist du bei einer Angabe unsicher, lass sie weg. Unvollstaendig ist besser als falsch.',
    '- Die lokalen FAQ muessen ORTSSPEZIFISCH sein. Was auf jeder Stadtseite Deutschlands stehen koennte, gehoert nicht hierher.',
    '- Nenne den Stadtnamen in den Texten. Kein Baukasten-Text mit austauschbarem Ort.',
    '- Keine Werbesprache, keine Superlative. Sachlich, wie ein Nachschlagewerk.',
    '',
    'Sprache: Deutsch mit korrekten Umlauten (ä, ö, ü, ß).',
    'Die vorgegebenen Kontext-Fakten sind bereits geprueft — wiederhole sie nicht als FAQ und widersprich ihnen nicht.',
  ].join('\n')
}

function userMessage(k: StadtKontext): string {
  return [
    `Stadt: ${k.name} (${k.bundesland}), PLZ-Bereich ${k.plzPrefix}, ${k.bevoelkerung} Einwohner.`,
    '',
    'Bereits geprueft und auf der Seite vorhanden (nicht wiederholen):',
    `- Zustaendige Gerichte: ${k.amtsgericht} (bis 5.000 € Streitwert), ${k.landgericht} darueber`,
    `- Naechstgelegene Orte: ${k.nachbarorte.join(', ') || '—'}`,
    '',
    `Liefere die hyperlokalen Angaben zu ${k.name} ueber das Tool.`,
  ].join('\n')
}

export type LokalinhaltDraft = LokalinhaltEntwurf & { ai_model: string }

/**
 * Erzeugt einen Entwurf. Ergebnis ist UNGEPRUEFT — der Caller muss es durch
 * `pruefeLokalinhalt` schicken, bevor irgendetwas gespeichert wird.
 */
export async function generateLokalinhaltDraft(
  kontext: StadtKontext,
): Promise<{ ok: true; data: LokalinhaltDraft } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY nicht konfiguriert' }

  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 })

  try {
    const response = await anthropic.messages.create({
      model: LOKALINHALT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage(kontext) }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'erfasse_ortsinhalt' },
    })

    const block = response.content.find((c) => c.type === 'tool_use')
    if (!block || block.type !== 'tool_use') {
      return { ok: false, error: 'Modell lieferte kein Tool-Ergebnis' }
    }

    // Bewusst KEINE Validierung hier — das Gate ist die eine Stelle, die prueft.
    // Zwei Prueforte wuerden auseinanderlaufen.
    const roh = block.input as Partial<LokalinhaltEntwurf>

    return {
      ok: true,
      data: {
        stadtbezirke: roh.stadtbezirke ?? [],
        hauptachsen: roh.hauptachsen ?? { autobahnen: [], bundesstrassen: [], knoten: [] },
        unfallHotspots: roh.unfallHotspots ?? [],
        lokaleFaqs: roh.lokaleFaqs ?? [],
        heroAnker: roh.heroAnker,
        topografieAnker: roh.topografieAnker,
        ai_model: LOKALINHALT_MODEL,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Anthropic-API-Fehler: ${msg}` }
  }
}
