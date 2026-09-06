// Vertrieb Lead-Website-Enrichment: holt den Ansprechpartner + Kontakt (Email/Telefon) aus
// dem Impressum/Kontakt der Firmen-Website (öffentliche Pflichtangaben) via LLM-Extraktion.
// Pure lib (kein 'use server'). Fetches sind fail-soft (Timeout, null bei Fehler).
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'

export type LeadEnrichment = {
  vorname: string | null
  nachname: string | null
  position: string | null
  email: string | null
  telefon: string | null
}

const FETCH_TIMEOUT_MS = 8000
const MAX_TEXT = 12000

function normalizeUrl(website: string): string | null {
  const w = website.trim()
  if (!w) return null
  return /^https?:\/\//i.test(w) ? w : `https://${w}`
}

/** Holt eine URL und wandelt HTML grob in Text um. Fail-soft: null bei Fehler/Timeout. */
async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'ClaimondoBot/1.0 (+https://claimondo.de)' },
    })
    if (!res.ok) return null
    const html = await res.text()
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Extrahiert den Haupt-Ansprechpartner einer Firma aus Homepage + /impressum + /kontakt.
 * Gibt null zurück, wenn keine Website / kein Text / kein API-Key / LLM-Fehler.
 */
export async function reichereAusWebsite(website: string, firma: string): Promise<LeadEnrichment | null> {
  const base = normalizeUrl(website)
  if (!base) return null
  let origin: string | null = null
  try {
    origin = new URL(base).origin
  } catch {
    return null
  }

  const pages = await Promise.all([
    fetchText(base),
    fetchText(`${origin}/impressum`),
    fetchText(`${origin}/kontakt`),
  ])
  const text = pages.filter((p): p is string => Boolean(p)).join('\n\n').slice(0, MAX_TEXT)
  if (!text) return null

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const system =
    'Sie extrahieren den HAUPT-Ansprechpartner (Geschäftsführer/Inhaber/verantwortliche ' +
    'Kontaktperson) einer Firma aus deren Website-/Impressum-Text. Antworte AUSSCHLIESSLICH mit ' +
    'einem JSON-Objekt, kein Fließtext. Setze ein Feld auf null, wenn es nicht eindeutig ' +
    'auffindbar ist — erfinde NICHTS. Bei der E-Mail bevorzuge eine persönliche Adresse ' +
    '(vorname.nachname@) vor info@/kontakt@, nimm aber info@ wenn keine persönliche da ist.'
  const user =
    `Firma: ${firma}\n\nWebsite-Text:\n${text}\n\n` +
    'Gib NUR dieses JSON zurück: ' +
    '{"vorname":string|null,"nachname":string|null,"position":string|null,"email":string|null,"telefon":string|null}'

  try {
    const anthropic = new Anthropic({ apiKey })
    const msg = await anthropic.messages.create({
      model: AI_MODELS.lead_enrichment,
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: user }],
    })
    const out = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const json = out.match(/\{[\s\S]*\}/)
    if (!json) return null
    const parsed = JSON.parse(json[0]) as Partial<Record<keyof LeadEnrichment, unknown>>
    const clean = (v: unknown): string | null => {
      const s = typeof v === 'string' ? v.trim() : ''
      return s || null
    }
    return {
      vorname: clean(parsed.vorname),
      nachname: clean(parsed.nachname),
      position: clean(parsed.position),
      email: clean(parsed.email),
      telefon: clean(parsed.telefon),
    }
  } catch {
    return null
  }
}
