// Wissen-AI-Redaktion: Claude-Generierung fuer strukturierte Artikel-Drafts.
//
// Spiegelt das Pattern aus src/lib/ai/briefing-structured.ts:
//   - Anthropic-Client direkt instantiiert (kein Singleton-Wrapper noetig)
//   - JSON-Output via System-Prompt erzwungen (kein tool_use / beta-Kanal)
//   - extractJsonObject toleriert ```json-Fences und Einleitungstext
//   - Fehler -> { ok: false, error } statt throw
//
// Das Modell-ID wird in generateArtikelDraft als data.ai_model
// zurueckgegeben, damit der Caller es direkt in wissen_artikel.ai_model persistieren kann.

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'

export const WISSEN_MODEL = AI_MODELS.sv_briefing_struktur // claude-sonnet-4-6
const MAX_OUTPUT_TOKENS = 2048

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThemaInput = {
  titel: string
  kurzbrief?: string
  primary_keyword?: string
  cluster?: string
  artikel_typ?: string
}

export type ArtikelDraft = {
  slug: string
  title: string
  excerpt: string
  keyFacts: string[]
  metaDescription: string
  primaryKeyword: string
  cluster: string
  body: string
  /** Das tatsaechlich verwendete Modell — fuer Persistenz in wissen_artikel.ai_model. */
  ai_model: string
}

// ---------------------------------------------------------------------------
// System-Prompt
// ---------------------------------------------------------------------------

export function buildSystemPrompt(input: ThemaInput): string {
  return [
    'Du schreibst einen Wissens-Artikel fuer claimondo.de (Kfz-Schadenregulierung, unverschuldeter Unfall).',
    'HAUS-STIL: H1-Titel; direkt danach ein Blockquote "> **Kurz erklaert:** ..." (40-60 Woerter);',
    '  danach ## Sektionen; eine ## Haeufige Fragen Sektion (je **Frage?** + Antwort); Deutsch mit korrekten Umlauten.',
    'PFLICHT: belege mit ECHTEN BGH-Az. (Format "BGH VI ZR 123/45") und §§ (z.B. "§ 249 BGB").',
    '  Erfinde NIE ein Aktenzeichen. Bist du unsicher, schreibe die Aussage ohne Az. statt zu halluzinieren.',
    'VERBOT: keine konkrete Einzelfall-Handlungsempfehlung (RDG) — nur allgemeine Information.',
    'Schliesse mit einem Hinweis, dass dies allgemeine Information und keine Rechtsberatung ist.',
    '',
    'Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (kein Markdown-Code-Fence, kein Text davor/danach):',
    '{',
    '  "slug": "<url-slug 3-80 Zeichen, nur a-z0-9-  — Thema: ' + input.titel + '>",',
    '  "title": "<SEO-Titel, ca. 50-60 Zeichen>",',
    '  "excerpt": "<Teaser-Text, ca. 120-160 Zeichen>",',
    '  "keyFacts": ["<Fakt 1>", "<Fakt 2>", "<Fakt 3>"],',
    '  "metaDescription": "<Meta-Beschreibung, ca. 120-155 Zeichen>",',
    '  "primaryKeyword": "<Haupt-Keyword>",',
    '  "cluster": "<Themen-Cluster>",',
    '  "body": "<vollstaendiger Artikel-Body als Markdown-String>"',
    '}',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// JSON-Extraktion (tolerant gegenueber Fences/Einleitungstext)
// ---------------------------------------------------------------------------

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenceMatch?.[1] ?? trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Kein JSON-Objekt in Claude-Response')
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

// ---------------------------------------------------------------------------
// parseDraft — NEVER throws, validates all 8 required fields + body length
// ---------------------------------------------------------------------------

export function parseDraft(
  raw: string,
): { ok: true; data: ArtikelDraft } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Ungueliges JSON' }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'JSON ist kein Objekt' }
  }

  const obj = parsed as Record<string, unknown>

  // Pflichtfelder pruefen
  const requiredStrings: (keyof ArtikelDraft)[] = [
    'slug',
    'title',
    'excerpt',
    'metaDescription',
    'primaryKeyword',
    'cluster',
    'body',
  ]
  for (const field of requiredStrings) {
    if (typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
      return { ok: false, error: `Pflichtfeld fehlt oder leer: ${field}` }
    }
  }

  // keyFacts: nicht-leeres Array mit mindestens 1 String-Eintrag
  if (
    !Array.isArray(obj.keyFacts) ||
    obj.keyFacts.length === 0 ||
    typeof obj.keyFacts[0] !== 'string'
  ) {
    return { ok: false, error: 'Pflichtfeld fehlt oder leer: keyFacts' }
  }

  // Slug-Format-Check (DB-Constraint: ^[a-z0-9-]{3,80}$)
  if (!/^[a-z0-9-]{3,80}$/.test(obj.slug as string)) {
    return { ok: false, error: 'slug ungueltig (nur a-z0-9-, 3-80 Zeichen)' }
  }

  return {
    ok: true,
    data: {
      slug: obj.slug as string,
      title: obj.title as string,
      excerpt: obj.excerpt as string,
      keyFacts: obj.keyFacts as string[],
      metaDescription: obj.metaDescription as string,
      primaryKeyword: obj.primaryKeyword as string,
      cluster: obj.cluster as string,
      body: obj.body as string,
      ai_model: WISSEN_MODEL,
    },
  }
}

// ---------------------------------------------------------------------------
// generateArtikelDraft — Anthropic-Client-Call nach briefing-structured.ts-Pattern
// ---------------------------------------------------------------------------

export async function generateArtikelDraft(
  input: ThemaInput,
): Promise<{ ok: true; data: ArtikelDraft } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY nicht konfiguriert' }
  }

  const anthropic = new Anthropic({
    apiKey,
    timeout: 60_000,
    maxRetries: 2,
  })

  const systemPrompt = buildSystemPrompt(input)

  const userMessage = [
    `Thema: ${input.titel}`,
    input.kurzbrief ? `Kurzbrief: ${input.kurzbrief}` : null,
    input.primary_keyword ? `Primary Keyword: ${input.primary_keyword}` : null,
    input.cluster ? `Cluster: ${input.cluster}` : null,
    input.artikel_typ ? `Artikel-Typ: ${input.artikel_typ}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const response = await anthropic.messages.create({
      model: WISSEN_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    })

    const firstBlock = response.content[0]
    const raw = firstBlock && firstBlock.type === 'text' ? firstBlock.text : ''

    let extracted: unknown
    try {
      extracted = extractJsonObject(raw)
    } catch {
      return { ok: false, error: `JSON-Extraktion fehlgeschlagen: ${raw.slice(0, 200)}` }
    }

    // parseDraft erwartet einen String — daher serialisieren wir das bereits-geparste Objekt
    return parseDraft(JSON.stringify(extracted))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Anthropic-API-Fehler: ${msg}` }
  }
}
