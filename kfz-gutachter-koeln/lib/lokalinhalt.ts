// Freigegebene Ortstiefe aus stadt_lokalinhalte — der Read fuer diese Cluster-Domain.
//
// WARUM: Die LP-Seiten dieser Domain glichen einander zu 75–88 % (4-Gramm-
// Jaccard, gemessen 18.08.2026). Die Spec des Programms setzt die Grenze bei
// < 40 % ("Darueber = Template-Text"). Ursache ist nicht fehlende Technik,
// sondern fehlender Ortsinhalt: der ortsspezifische Anteil betraegt 74–396
// Woerter bei ~2.800 Woertern Seitenumfang, also 3–14 %. Bei Near-Duplicates
// indexiert Google einen Repraesentanten — daher 4 von 10 Seiten im Index.
//
// Diese Datei holt die substanziellen Bloecke (Stadtbezirke, Verkehrsachsen,
// Unfallschwerpunkte, lokale FAQs) aus derselben Quelle, die claimondo.de seit
// P3-B1 nutzt. Sie werden ueber den Admin erzeugt und muessen ein Substanz-Gate
// bestehen (>= 3 harte Fakten, jeder Hotspot mit belegbarer Quell-URL).
//
// Zugriffsweg: cookie-loser Anon-Client + RLS-Policy (Migration
// 20260816175742_stadt_lokalinhalte_public_read). Bewusst NICHT service_role.

import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'

export type Stadtbezirk = { name: string; ortsteile: string[] }
export type Hauptachsen = { autobahnen: string[]; bundesstrassen: string[]; knoten: string[] }
export type UnfallHotspot = { ort: string; beschreibung: string; quelle: string; einzelfall?: boolean }
export type LokaleFaq = { frage: string; antwort: string }

export type Lokalinhalt = {
  stadtbezirke: Stadtbezirk[]
  hauptachsen: Hauptachsen
  unfallHotspots: UnfallHotspot[]
  lokaleFaqs: LokaleFaq[]
  topografieAnker?: string
  aiGenerated: boolean
}

/**
 * Cluster-Slug -> Slug der Stadtseite.
 *
 * ⚠ Ohne diese Tabelle bekaemen zwei Orte STILL nichts: der Cluster fuehrt
 * `monheim` und `stolberg`, die gepflegten Stadtdaten `monheim-am-rhein` und
 * `stolberg-rheinland`. Kein Fehler, keine leere Seite — der Block fehlt
 * einfach. Dieselbe Klasse wie der verkuerzte Ortsname in duesseldorfs
 * angrenzendeOrte (17.08.), der einen Link still verschluckte.
 */
const SLUG_ALIAS: Record<string, string> = {
  monheim: 'monheim-am-rhein',
  stolberg: 'stolberg-rheinland',
}

/** Belastbare Quelle = absolute http(s)-URL mit echtem Host. Dieselbe Regel wie
 *  im Schreib-Gate — hier ein zweites Mal, weil der Read die letzte Instanz vor
 *  der Veroeffentlichung ist und ein erfundener "Unfallschwerpunkt" eine
 *  Tatsachenbehauptung ueber einen realen Ort waere. */
function istBelegbareQuelle(quelle: unknown): quelle is string {
  if (typeof quelle !== 'string' || !quelle.trim()) return false
  let url: URL
  try {
    url = new URL(quelle)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (!host.includes('.')) return false
  if (host === 'localhost' || host.endsWith('.local')) return false
  if (host === 'example.com' || host.endsWith('.example.com')) return false
  return true
}

const alsArray = (w: unknown): unknown[] => (Array.isArray(w) ? w : [])
const alsText = (w: unknown): string | undefined => {
  const s = typeof w === 'string' ? w.trim() : ''
  return s ? s : undefined
}
const alsTextliste = (w: unknown): string[] =>
  alsArray(w).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)

/** DB-Zeile -> Anzeigeform. Pur, damit sie ohne DB pruefbar ist. Liefert null,
 *  wenn nichts Anzeigbares uebrig bleibt — sonst steht eine Ueberschrift ueber
 *  einem leeren Block. */
export function mapLokalinhalt(zeile: unknown): Lokalinhalt | null {
  if (!zeile || typeof zeile !== 'object') return null
  const z = zeile as Record<string, unknown>

  const stadtbezirke: Stadtbezirk[] = alsArray(z.stadtbezirke)
    .map((b) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {}))
    .map((b) => ({ name: alsText(b.name) ?? '', ortsteile: alsTextliste(b.ortsteile) }))
    .filter((b) => b.name.length > 0)

  const rohAchsen =
    z.hauptachsen && typeof z.hauptachsen === 'object' && !Array.isArray(z.hauptachsen)
      ? (z.hauptachsen as Record<string, unknown>)
      : {}
  const hauptachsen: Hauptachsen = {
    autobahnen: alsTextliste(rohAchsen.autobahnen),
    bundesstrassen: alsTextliste(rohAchsen.bundesstrassen),
    knoten: alsTextliste(rohAchsen.knoten),
  }

  const unfallHotspots = alsArray(z.unfall_hotspots)
    .map((h) => (h && typeof h === 'object' ? (h as Record<string, unknown>) : {}))
    .filter((h) => alsText(h.ort) && alsText(h.beschreibung) && istBelegbareQuelle(h.quelle))
    .map((h) => ({
      ort: alsText(h.ort)!,
      beschreibung: alsText(h.beschreibung)!,
      quelle: h.quelle as string,
      ...(h.einzelfall === true ? { einzelfall: true as const } : {}),
    }))

  const lokaleFaqs: LokaleFaq[] = alsArray(z.lokale_faqs)
    .map((f) => (f && typeof f === 'object' ? (f as Record<string, unknown>) : {}))
    .filter((f) => alsText(f.frage) && alsText(f.antwort))
    .map((f) => ({ frage: alsText(f.frage)!, antwort: alsText(f.antwort)! }))

  const topografieAnker = alsText(z.topografie_anker)

  const hatInhalt =
    stadtbezirke.length > 0 ||
    unfallHotspots.length > 0 ||
    lokaleFaqs.length > 0 ||
    hauptachsen.autobahnen.length > 0 ||
    hauptachsen.bundesstrassen.length > 0 ||
    hauptachsen.knoten.length > 0 ||
    Boolean(topografieAnker)
  if (!hatInhalt) return null

  return {
    stadtbezirke,
    hauptachsen,
    unfallHotspots,
    lokaleFaqs,
    ...(topografieAnker ? { topografieAnker } : {}),
    aiGenerated: z.ai_generated !== false,
  }
}

const SPALTEN =
  'stadt_slug, status, stadtbezirke, hauptachsen, unfall_hotspots, lokale_faqs, topografie_anker, ai_generated'

let _anon: ReturnType<typeof createClient> | null = null
function anonClient() {
  if (!_anon) {
    _anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  }
  return _anon
}

async function ladeUngecacht(clusterSlug: string): Promise<Lokalinhalt | null> {
  // Ohne Env still aus: der Build laeuft auch lokal ohne Supabase-Zugang, und
  // eine oeffentliche Seite darf daran nicht zerbrechen.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null
  }
  const stadtSlug = SLUG_ALIAS[clusterSlug] ?? clusterSlug
  try {
    const { data, error } = await anonClient()
      .from('stadt_lokalinhalte')
      .select(SPALTEN)
      .eq('stadt_slug', stadtSlug)
      .eq('status', 'veroeffentlicht')
      .maybeSingle()
    if (error) {
      console.error(`[lokalinhalt] Lesefehler fuer ${stadtSlug}:`, error.message)
      return null
    }
    return mapLokalinhalt(data)
  } catch (err) {
    console.error(`[lokalinhalt] Lesefehler fuer ${stadtSlug}:`, err)
    return null
  }
}

/** Pro Request nur einmal — Metadata und Render laufen getrennt. */
export const ladeLokalinhalt = cache(ladeUngecacht)
