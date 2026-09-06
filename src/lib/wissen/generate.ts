// Wissen-AI-Redaktion: Claude-Generierung fuer strukturierte Artikel-Drafts.
//
// 2-Teile-Antwortformat (Smoke-getrieben, s.u.):
//   TEIL 1 = Metadaten-JSON (kurze Felder, escapt zuverlaessig)
//   TEIL 2 = ===BODY=== + roher Markdown-Body (KEINE JSON-Escapes noetig)
// Grund: der lange Markdown-Body als JSON-String-Wert brach in ~1/3 der Faelle
// (ungeschuetzte Anfuehrungszeichen/Umbrueche -> JSON.parse-Fehler). Body separat
// = robust. Fehler -> { ok: false, error } statt throw.
//
// Das Modell-ID wird in generateArtikelDraft als data.ai_model zurueckgegeben,
// damit der Caller es direkt in wissen_artikel.ai_model persistieren kann.

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import { extractAnthropicText } from '@/lib/ai/extract-text'

export const WISSEN_MODEL = AI_MODELS.sv_briefing_struktur
const MAX_OUTPUT_TOKENS = 8192 // voller Artikel (Body + FAQ); 2048 wuerde truncaten
const BODY_MARKER = '===BODY==='

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
  tags: string[]
  /** Das tatsaechlich verwendete Modell — fuer Persistenz in wissen_artikel.ai_model. */
  ai_model: string
}

// ---------------------------------------------------------------------------
// System-Prompt
// ---------------------------------------------------------------------------

// Statische System-Prompts (arg-los) — dies ist der Prompt-Caching-Prefix (gilt
// auch fuer buildB2BSystemPrompt unten). Per-Artikel-Kontext (Titel etc.) lebt
// NUR in der User-Message (generateArtikelDraft), damit der gecachte Prefix ueber
// Artikel hinweg byte-identisch bleibt und der Cache wirklich greift. KEIN input.*
// hier drin (frueher: input.titel in der slug-Zeile -> Prefix pro Artikel unique
// -> cache_read immer 0 + 1.25x-Write-Premium umsonst).
export function buildSystemPrompt(): string {
  return [
    'Du schreibst einen Wissens-Artikel fuer claimondo.de (Kfz-Schadenregulierung, unverschuldeter Unfall).',
    'HAUS-STIL: H1-Titel; direkt danach ein Blockquote "> **Kurz erklaert:** ..." (40-60 Woerter);',
    '  danach ## Sektionen; eine ## Haeufige Fragen Sektion (je **Frage?** + Antwort); Deutsch mit korrekten Umlauten.',
    // Ohne diese Zeile waehlt das Modell die Anrede frei und erzeugt laufend neue Du-Texte —
    // egal wie sauber der Bestand einmal umgestellt wurde. Das "Du" oben richtet sich an DICH,
    // das Modell; der erzeugte Text spricht den Leser mit Sie an.
    'ANREDE: Der ERZEUGTE Text siezt den Leser durchgehend ("Sie", "Ihr Fahrzeug", "wenden Sie sich").',
    '  Niemals duzen. Das gilt fuer Fliesstext, Zwischenueberschriften und die Haeufige-Fragen-Sektion.',
    'BELEGE: Nenne die einschlaegigen §§ (z.B. "§ 249 BGB", "§ 254 BGB", "§ 7 StVG") — die sind Pflicht.',
    '  BGH-Aktenzeichen NUR, wenn du dir des EXAKTEN Az. absolut sicher bist. Im Zweifel formuliere',
    '  "der BGH hat entschieden, dass ..." OHNE Aktenzeichen. Ein erfundenes oder falsches Aktenzeichen',
    '  ist ein schwerer Fehler — lieber gar kein Az. als ein geratenes. Alle Belege werden vor der',
    '  Veroeffentlichung redaktionell auf Richtigkeit geprueft.',
    'VERBOT: keine konkrete Einzelfall-Handlungsempfehlung (RDG) — nur allgemeine Information.',
    'Schliesse den Body mit einem Hinweis, dass dies allgemeine Information und keine Rechtsberatung ist.',
    '',
    'ANTWORTFORMAT — genau ZWEI Teile nacheinander, sonst nichts:',
    'TEIL 1: ein JSON-Objekt mit den Metadaten (KEIN body-Feld). In den JSON-Textwerten KEINE',
    '  geraden Anfuehrungszeichen (") verwenden — nutze typografische („ ") oder gar keine:',
    '{',
    '  "slug": "<url-slug 3-80 Zeichen, nur a-z 0-9 und Bindestrich — passend zum gegebenen Thema>",',
    '  "title": "<SEO-Titel, ca. 50-60 Zeichen>",',
    '  "excerpt": "<Teaser-Text, ca. 120-160 Zeichen>",',
    '  "keyFacts": ["<Fakt 1>", "<Fakt 2>", "<Fakt 3>"],',
    '  "metaDescription": "<Meta-Beschreibung, ca. 120-155 Zeichen>",',
    '  "primaryKeyword": "<Haupt-Keyword>",',
    '  "cluster": "<Themen-Cluster>"',
    '}',
    'TEIL 2: danach eine eigene Zeile mit exakt ' + BODY_MARKER + ' und darunter der vollstaendige',
    '  Artikel-Body als reines Markdown — NICHT in JSON, keine Escapes, normale Zeilenumbrueche.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// B2B-System-Prompt (Fachton fuer Sachverstaendige, Anwaelte, Werkstaetten, Makler)
// ---------------------------------------------------------------------------

export function buildB2BSystemPrompt(): string {
  return [
    'Du schreibst einen Fach-Artikel fuer claimondo.de (Kfz-Schadenregulierung, Branchenthemen).',
    'ZIELGRUPPE: Fach-Leser: Kfz-Sachverständige, Rechtsanwälte/Kanzleien, Kfz-Werkstätten und Versicherungsmakler',
    '  — kollegialer Fachton, KEIN Geschädigten-Du. Keine Erklärungen für Laien.',
    // "Kollegialer Fachton" allein liess die Anrede offen — kollegial kann auch geduzt sein.
    // Hier wird sie ausdruecklich festgelegt, sonst driftet der Generator wieder auseinander.
    'ANREDE: Wo der Text den Leser anspricht, wird gesiezt ("Sie", "Ihre Mandantschaft"). Niemals duzen.',
    'RELEVANZ-CHECK (ZUERST): Relevant ist NUR, was Kfz-Sachverständige, Kfz-Werkstätten, Kfz-Versicherung/',
    '  Kaskoschaden, Fahrzeugbewertung/Gutachten oder Verkehrs-/Schadenrecht FACHLICH betrifft. NICHT relevant',
    '  (dann antworte AUSSCHLIESSLICH mit dem einzelnen Wort NICHT_RELEVANT — kein JSON, kein Body, sonst',
    '  nichts) ist u.a.: allgemeine Kfz-Branchen-/Handels-/Autohaus-News (Händlernetze, Übernahmen, Neuwagen-',
    '  Vorstellungen, E-Mobilitäts-Produkte), Motorsport/Rennsport, Personalien/Nachrufe/Verbands-Termine,',
    '  reine Lebens-/Kranken-/Rentenversicherung sowie themenfremdes Recht (Politik, Steuer, Immobilien,',
    '  Medien, Strafrecht) ohne Kfz-Schaden-Bezug.',
    'HAUS-STIL: H1-Titel; direkt danach ein Blockquote "> **Kurz zusammengefasst:** ..." (40-60 Wörter);',
    '  danach ## Sektionen; eine ## Häufige Fragen Sektion (je **Frage?** + Antwort); Deutsch mit korrekten Umlauten.',
    'FAKTENGRUNDLAGE: Nutze den Kurzbrief als Faktengrundlage. Verfasse eine EIGENSTÄNDIGE Zusammenfassung/Analyse',
    '  (KEIN Nachdruck fremder Texte). Falls eine Quelle genannt ist, schließe den Artikel mit einer Zeile:',
    '  **Quelle:** <name/url aus dem Kurzbrief>',
    'BELEGE: Nenne die einschlägigen §§ (z.B. "§ 249 BGB", "§ 254 BGB", "§ 7 StVG") — die sind Pflicht, wo juristisch relevant.',
    '  BGH-Aktenzeichen NUR, wenn du dir des EXAKTEN Az. absolut sicher bist. Im Zweifel formuliere',
    '  "der BGH hat entschieden, dass ..." OHNE Aktenzeichen. Ein erfundenes oder falsches Aktenzeichen',
    '  ist ein schwerer Fehler — lieber gar kein Az. als ein geratenes. Alle Belege werden vor der',
    '  Veröffentlichung redaktionell auf Richtigkeit geprüft.',
    'VERBOT: keine konkrete Einzelfall-Handlungsempfehlung (RDG) — nur allgemeine Fachinformation.',
    'Schließe den Body mit GENAU diesem Satz als eigenem letzten Absatz (wörtlich, unverändert):',
    '  „Dieser Beitrag ist allgemeine Fachinformation und keine Rechtsberatung."',
    '',
    'ANTWORTFORMAT — genau ZWEI Teile nacheinander, sonst nichts:',
    'TEIL 1: ein JSON-Objekt mit den Metadaten (KEIN body-Feld). In den JSON-Textwerten KEINE',
    '  geraden Anführungszeichen (") verwenden — nutze typografische („ ") oder gar keine:',
    '{',
    '  "slug": "<url-slug 3-80 Zeichen, nur a-z 0-9 und Bindestrich — passend zum gegebenen Thema>",',
    '  "title": "<SEO-Titel, ca. 50-60 Zeichen>",',
    '  "excerpt": "<Teaser-Text, ca. 120-160 Zeichen>",',
    '  "keyFacts": ["<Fakt 1>", "<Fakt 2>", "<Fakt 3>"],',
    '  "metaDescription": "<Meta-Beschreibung, ca. 120-155 Zeichen>",',
    '  "primaryKeyword": "<Haupt-Keyword>",',
    '  "cluster": "<Themen-Cluster>",',
    '  "tags": ["<Tag1>", "<Tag2>"]',
    '}',
    'Das Feld "tags" darf 1 bis 3 Werte enthalten. Wähle AUSSCHLIESSLICH aus exakt diesen Werten (wörtlich übernehmen):',
    '  Schadenregulierung, Recht & Urteile, Gutachten, Werkstatt, Versicherer, Markt & News, Tools',
    'TEIL 2: danach eine eigene Zeile mit exakt ' + BODY_MARKER + ' und darunter der vollständige',
    '  Artikel-Body als reines Markdown — NICHT in JSON, keine Escapes, normale Zeilenumbrüche.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// JSON-Extraktion (tolerant gegenueber Fences/Einleitungstext) — nur fuer den
// kleinen Metadaten-Teil (TEIL 1), nicht mehr fuer den Body.
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
// parseDraft — NEVER throws. Erwartet das 2-Teile-Format: Metadaten-JSON,
// dann BODY_MARKER, dann roher Markdown-Body.
// ---------------------------------------------------------------------------

export function parseDraft(
  raw: string,
): { ok: true; data: ArtikelDraft } | { ok: false; error: string } {
  const markerIdx = raw.indexOf(BODY_MARKER)
  if (markerIdx < 0) {
    return { ok: false, error: `Antwortformat ungueltig: ${BODY_MARKER} fehlt` }
  }
  const metaPart = raw.slice(0, markerIdx)
  const body = raw.slice(markerIdx + BODY_MARKER.length).replace(/^[ \t]*\r?\n/, '').trim()
  if (body.length < 100) {
    return { ok: false, error: 'Body fehlt oder zu kurz' }
  }

  let parsed: unknown
  try {
    parsed = extractJsonObject(metaPart)
  } catch {
    return { ok: false, error: 'Metadaten-JSON ungueltig' }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Metadaten sind kein Objekt' }
  }
  const obj = parsed as Record<string, unknown>

  const requiredStrings = ['slug', 'title', 'excerpt', 'metaDescription', 'primaryKeyword', 'cluster'] as const
  for (const field of requiredStrings) {
    if (typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
      return { ok: false, error: `Pflichtfeld fehlt oder leer: ${field}` }
    }
  }
  if (!Array.isArray(obj.keyFacts) || obj.keyFacts.length === 0 || typeof obj.keyFacts[0] !== 'string') {
    return { ok: false, error: 'Pflichtfeld fehlt oder leer: keyFacts' }
  }
  if (!/^[a-z0-9-]{3,80}$/.test(obj.slug as string)) {
    return { ok: false, error: 'slug ungueltig (nur a-z0-9-, 3-80 Zeichen)' }
  }

  const tags: string[] =
    Array.isArray(obj.tags) ? (obj.tags as unknown[]).filter((t): t is string => typeof t === 'string') : []

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
      body,
      tags,
      ai_model: WISSEN_MODEL,
    },
  }
}

// ---------------------------------------------------------------------------
// generateArtikelDraft — Anthropic-Client-Call
// ---------------------------------------------------------------------------

export async function generateArtikelDraft(
  input: ThemaInput,
  audience: 'consumer' | 'b2b' = 'consumer',
): Promise<{ ok: true; data: ArtikelDraft } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY nicht konfiguriert' }
  }

  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 })

  const systemPrompt = audience === 'b2b' ? buildB2BSystemPrompt() : buildSystemPrompt()
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
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    })

    const raw = extractAnthropicText(response.content)
    // KI-Relevanz-Backstop (nur B2B): faengt Keyword-Filter-False-Positives, bevor
    // ein themenfremder Artikel entsteht. Das Modell antwortet mit NICHT_RELEVANT.
    if (audience === 'b2b' && /^\s*NICHT_RELEVANT\b/i.test(raw)) {
      return { ok: false, error: 'nicht_relevant' }
    }
    return parseDraft(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Anthropic-API-Fehler: ${msg}` }
  }
}
