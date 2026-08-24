import { cache } from 'react'

// Marketing-Read fuer freigegebene Stadt-Lokalinhalte (Tabelle stadt_lokalinhalte).
//
// WARUM diese Datei das offene Ende der P2-Pipeline schliesst: Gate, Generator,
// Admin-Actions, Admin-Seite und Tabelle existieren seit 12.08. — aber NICHTS
// las die Zeilen aus. Eine Tabelle mit 500 freigegebenen Eintraegen waere ohne
// diesen Read genauso unsichtbar wie mit null. Dasselbe Muster wie bei
// wissen_artikel: 60 Zeilen, 55 "veroeffentlicht", 0 Consumer im ganzen Repo.
// `status='veroeffentlicht'` beweist nichts — erst der Consumer beweist es.
//
// Zugriffsweg: cookie-loser Anon-Client + RLS-Policy (Migration
// 20260816175742_stadt_lokalinhalte_public_read). Bewusst NICHT service_role:
// der ganze Zweck der Tabelle ist "kein Auto-Publish, redaktionelle Freigabe ist
// Pflicht" — ein service_role-Read koennte Entwuerfe ausliefern, sobald jemand
// den Statusfilter vergisst. Muster uebernommen von lib/wissen/db-articles.ts.

import { createClient as createAnonClient } from '@supabase/supabase-js'
import type { Hauptachsen, LokaleFaq, Stadtbezirk, UnfallHotspot } from './staedte'

/** Ortstiefe, die redaktionell freigegeben wurde. Feldnamen bewusst wie in
 *  `HyperLocal`, damit die Stadtseite beide Quellen gleich behandeln kann. */
export type Lokalinhalt = {
  stadtbezirke: Stadtbezirk[]
  hauptachsen: Hauptachsen
  /** Nur Hotspots mit abrufbarer Quell-URL — siehe `istBelegbareQuelle`. */
  unfallHotspots: Array<UnfallHotspot & { quelle: string; einzelfall?: boolean }>
  lokaleFaqs: LokaleFaq[]
  heroAnker?: string
  topografieAnker?: string
  /** Fuer die Transparenz-Kennzeichnung generierter Inhalte (UWG). */
  aiGenerated: boolean
  /**
   * Wann dieser Inhalt live ging (ISO). Traegt das Freshness-Signal von
   * Sitemap und JSON-LD — vorher meldeten beide ein hartkodiertes Datum, und
   * eine an dem Tag frisch erzeugte Stadt sah fuer Google Monate alt aus.
   */
  veroeffentlichtAm?: string
}

/**
 * Belastbare Quelle = absolute http(s)-URL mit echtem Host.
 *
 * Dieselbe Regel wie im Schreib-Gate (src/lib/lokalinhalt/gate.ts) — hier
 * bewusst ein zweites Mal. Das Gate schuetzt den Weg ueber die Admin-Action;
 * eine Migration, ein Skript oder eine kuenftige zweite Action kaeme daran
 * vorbei. Der Read ist die letzte Instanz vor der Veroeffentlichung, und ein
 * erfundener "Unfallschwerpunkt" ist eine Tatsachenbehauptung ueber einen
 * realen Ort.
 */
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
  if (host === 'example.com' || host.endsWith('.example.com') || host === 'example.org') return false
  return true
}

const alsArray = (wert: unknown): unknown[] => (Array.isArray(wert) ? wert : [])
const alsText = (wert: unknown): string | undefined => {
  const s = typeof wert === 'string' ? wert.trim() : ''
  return s ? s : undefined
}
const alsTextliste = (wert: unknown): string[] =>
  alsArray(wert).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)

/**
 * DB-Zeile -> Marketing-Form. Pur, damit sie ohne DB testbar ist.
 *
 * Liefert `null`, wenn nach dem Filtern nichts Anzeigbares uebrig bleibt —
 * sonst rendert die Seite eine Ueberschrift ueber einem leeren Block.
 * Defensiv gegen kaputte jsonb-Werte: die 92 bestehenden Seiten duerfen an
 * einer fehlerhaften Zeile nicht zerbrechen.
 */
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

  const heroAnker = alsText(z.hero_anker)
  const topografieAnker = alsText(z.topografie_anker)

  const hatInhalt =
    stadtbezirke.length > 0 ||
    unfallHotspots.length > 0 ||
    lokaleFaqs.length > 0 ||
    hauptachsen.autobahnen.length > 0 ||
    hauptachsen.bundesstrassen.length > 0 ||
    hauptachsen.knoten.length > 0 ||
    Boolean(heroAnker) ||
    Boolean(topografieAnker)
  if (!hatInhalt) return null

  return {
    stadtbezirke,
    hauptachsen,
    unfallHotspots,
    lokaleFaqs,
    ...(heroAnker ? { heroAnker } : {}),
    ...(topografieAnker ? { topografieAnker } : {}),
    aiGenerated: z.ai_generated !== false,
    ...(typeof z.veroeffentlicht_am === 'string' ? { veroeffentlichtAm: z.veroeffentlicht_am } : {}),
  }
}

/** Nur die Spalten, die anon lesen darf (Migration 20260816175742). */
const SPALTEN =
  'stadt_slug, status, stadtbezirke, hauptachsen, unfall_hotspots, lokale_faqs, hero_anker, topografie_anker, ai_generated, veroeffentlicht_am'

// Lazy wie in lib/wissen/db-articles.ts: sonst wirft createAnonClient schon beim
// Modul-Load in Test-/Build-Kontexten ohne gesetzte Env-Vars, und mapLokalinhalt
// waere nicht mehr importierbar.
let _anon: ReturnType<typeof createAnonClient> | null = null
function anonClient() {
  if (!_anon) {
    _anon = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  }
  return _anon
}

/**
 * Die freigegebene Ortstiefe einer Stadt — oder `null`.
 *
 * `null` ist der Normalfall (die Tabelle ist leer, bis jemand etwas freigibt),
 * deshalb faellt die Seite hier still auf ihren bisherigen Zustand zurueck.
 * Ein DB-Fehler darf eine oeffentliche Seite ebenfalls nicht zerreissen: er
 * landet im Log und die Seite rendert ohne Zusatzinhalt.
 *
 * Der Statusfilter steht hier ZUSAETZLICH zur RLS-Policy — doppelt gemoppelt
 * ist bei "nichts Ungeprueftes veroeffentlichen" das richtige Mass.
 */
async function ladeLokalinhaltUngecacht(stadtSlug: string): Promise<Lokalinhalt | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null
  }
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

/**
 * Derselbe Read, pro Request nur EINMAL ausgefuehrt.
 *
 * Noetig, seit auch `generateMetadata` die Ortstiefe braucht (fuer die
 * Meta-Description): Next ruft Metadata und Seiten-Render getrennt auf, ohne
 * Deduplizierung waere das je Seitenaufruf ein zweiter Supabase-Call fuer
 * dieselbe Zeile. React `cache` haelt das Ergebnis innerhalb eines Requests —
 * anders als `fetch` dedupliziert Next Supabase-Aufrufe nicht von selbst.
 */
export const ladeLokalinhalt = cache(ladeLokalinhaltUngecacht)

/**
 * Veroeffentlichungsdatum je Stadt-Slug — EINE Query fuer alle Staedte.
 *
 * Fuer die Sitemap: dort werden 173 Stadt-Eintraege erzeugt, und 173 einzelne
 * `ladeLokalinhalt`-Aufrufe waeren 173 Supabase-Roundtrips fuer je ein Datum
 * (der React-`cache` dedupliziert nur gleiche Slugs, nicht verschiedene).
 *
 * Faellt bei jedem Fehler auf eine leere Map zurueck: eine kaputte Sitemap ist
 * schlimmer als eine mit konservativen Datumsangaben.
 */
export async function ladeLokalinhaltStaende(): Promise<Map<string, string>> {
  const leer = new Map<string, string>()
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return leer
  }
  try {
    const { data, error } = await anonClient()
      .from('stadt_lokalinhalte')
      .select('stadt_slug, veroeffentlicht_am')
      .eq('status', 'veroeffentlicht')
    if (error) {
      console.error('[lokalinhalt] Staende konnten nicht geladen werden:', error.message)
      return leer
    }
    const staende = new Map<string, string>()
    for (const z of (data ?? []) as Array<Record<string, unknown>>) {
      const slug = typeof z.stadt_slug === 'string' ? z.stadt_slug : null
      const am = typeof z.veroeffentlicht_am === 'string' ? z.veroeffentlicht_am : null
      if (slug && am) staende.set(slug, am)
    }
    return staende
  } catch (err) {
    console.error('[lokalinhalt] Staende konnten nicht geladen werden:', err)
    return leer
  }
}
