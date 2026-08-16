// Wissen-Themen-Planer: KI schlägt net-new B2B-Evergreen-Themen vor (coverage-aware).
// Pure Teile (Prompt/Parse/Dedupe) unit-getestet; der Anthropic-Call in proposeGapTopics.

import Anthropic from '@anthropic-ai/sdk'
import { WISSEN_MODEL } from '@/lib/wissen/generate'
import { extractAnthropicText } from '@/lib/ai/extract-text'

export type ProposedTopic = {
  titel: string
  kurzbrief: string
  primary_keyword: string
  cluster: string
  artikel_typ?: string
  tags?: string[]
}

export function buildProposeSystemPrompt(): string {
  return [
    'Du bist Themen-Planer für den B2B-Fach-Feed von claimondo.de (Kfz-Schadenregulierung).',
    'Schlage NEUE Evergreen-Fachthemen vor für Kfz-Sachverständige, Anwälte/Kanzleien, Werkstätten und Versicherungsmakler.',
    'DOMÄNE (nur daraus): Schadengutachten, Fahrzeugbewertung (Wiederbeschaffungswert/Restwert/Wertminderung),',
    '  Unfallregulierung, Verkehrs-/Schadenrecht (§§ BGB/StVG), Werkstatt-/Reparaturpraxis, Kasko-/Haftpflicht-Schaden,',
    '  Nutzungsausfall/Mietwagen, SV-Berufspraxis.',
    'NICHT vorschlagen: Motorsport/Rennsport, Neuwagen-/Händler-/E-Mobilitäts-News, Personalien/Nachrufe/Verbands-Termine,',
    '  reine Lebens-/Kranken-/Rentenversicherung, themenfremdes Recht (Politik/Steuer/Immobilien/Medien/Strafrecht).',
    'Bereits abgedeckte Themen NICHT wiederholen — gehe stattdessen spezifischer/long-tail.',
    '',
    'ANTWORTFORMAT: ausschließlich ein JSON-Array, sonst nichts. Jedes Element:',
    '{ "titel": "<Fach-Titel>", "kurzbrief": "<2-3 Sätze Fach-Angle als Faktengrundlage>",',
    '  "primary_keyword": "<Haupt-Keyword>", "cluster": "<Themen-Cluster>",',
    '  "artikel_typ": "<z.B. Ratgeber, Analyse, FAQ>", "tags": ["<0-3 Tags>"] }',
  ].join('\n')
}

export function buildProposeUserMessage(
  count: number,
  covered: { titles: string[]; keywords: string[] },
): string {
  const titles = covered.titles.slice(0, 120).join(' | ') || '(keine)'
  const keywords = covered.keywords.slice(0, 120).join(', ') || '(keine)'
  return [
    `Schlage ${count} distinkte, neue B2B-Evergreen-Themen vor.`,
    'Bereits abgedeckte Titel (NICHT wiederholen):',
    titles,
    'Bereits abgedeckte Keywords (NICHT wiederholen):',
    keywords,
    `Antworte mit einem JSON-Array von genau ${count} Objekten.`,
  ].join('\n')
}

export function normalizeKeyword(kw: string): string {
  return kw.trim().toLowerCase()
}

function extractJsonArray(text: string): unknown {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenceMatch?.[1] ?? trimmed
  const start = candidate.indexOf('[')
  const end = candidate.lastIndexOf(']')
  if (start < 0 || end < 0 || end <= start) throw new Error('Kein JSON-Array')
  return JSON.parse(candidate.slice(start, end + 1))
}

function isValidTopic(x: unknown): x is ProposedTopic {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.titel === 'string' &&
    o.titel.length > 0 &&
    typeof o.kurzbrief === 'string' &&
    o.kurzbrief.length > 0 &&
    typeof o.primary_keyword === 'string' &&
    o.primary_keyword.length > 0 &&
    typeof o.cluster === 'string' &&
    o.cluster.length > 0
  )
}

export function parseProposedTopics(
  raw: string,
): { ok: true; data: ProposedTopic[] } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = extractJsonArray(raw)
  } catch {
    return { ok: false, error: 'Kein JSON-Array in Response' }
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'Antwort ist kein Array' }
  const data = parsed.filter(isValidTopic).map((o) => ({
    titel: o.titel,
    kurzbrief: o.kurzbrief,
    primary_keyword: o.primary_keyword,
    cluster: o.cluster,
    artikel_typ: typeof o.artikel_typ === 'string' ? o.artikel_typ : undefined,
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : undefined,
  }))
  return { ok: true, data }
}

/** Titel -> Slug fuer Dedup: lowercased, Umlaute aufgeloest, nur a-z0-9 mit Bindestrichen. */
export function slugifyTitle(titel: string): string {
  return titel
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Hard-Dedup gegen bereits Abgedecktes: droppt Vorschlaege mit kollidierendem primary_keyword
// ODER Titel-Slug (Spec) — plus interne Duplikate. Ergaenzt die Soft-Avoidance im Prompt.
export function dedupeTopics(
  proposed: ProposedTopic[],
  covered: { keywords: string[]; titles: string[] },
): ProposedTopic[] {
  const seenKw = new Set(covered.keywords.map(normalizeKeyword))
  const seenTitle = new Set(covered.titles.map(slugifyTitle))
  const out: ProposedTopic[] = []
  for (const t of proposed) {
    const kw = normalizeKeyword(t.primary_keyword)
    const ts = slugifyTitle(t.titel)
    if (!kw || seenKw.has(kw) || (ts !== '' && seenTitle.has(ts))) continue
    seenKw.add(kw)
    if (ts !== '') seenTitle.add(ts)
    out.push(t)
  }
  return out
}

export async function proposeGapTopics(
  count: number,
  covered: { titles: string[]; keywords: string[] },
): Promise<{ ok: true; data: ProposedTopic[] } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY nicht konfiguriert' }

  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 })
  try {
    const response = await anthropic.messages.create({
      model: WISSEN_MODEL,
      max_tokens: 2048,
      system: [{ type: 'text', text: buildProposeSystemPrompt(), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildProposeUserMessage(count, covered) }],
    })
    const raw = extractAnthropicText(response.content)
    const parsed = parseProposedTopics(raw)
    if (!parsed.ok) return parsed
    return { ok: true, data: dedupeTopics(parsed.data, covered) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Anthropic-API-Fehler: ${msg}` }
  }
}
