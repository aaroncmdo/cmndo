import { createClient as createAnonClient } from '@supabase/supabase-js'
import { DEFAULT_AUTHOR } from '@/lib/feed/authors'
import type { FeedItem } from '@/lib/feed/types'

// Cookie-loser Anon-Client fuer OEFFENTLICHE Wissen-Artikel. Feed/Hub lesen nur
// veroeffentlichte Artikel (RLS-gated via Anon-Key) und brauchen keinen User-Context.
// Bewusst NICHT der cookie-basierte @/lib/supabase/server-Client: der wuerde in den
// force-static Feed-Routen cookies() lesen. Cookie-los = build-zeit-sicher fuer
// statische Generierung; RLS erzwingt weiterhin status='veroeffentlicht'.
// Lazy: erst beim ersten Query instanziieren (nicht beim Import) — sonst wirft
// createAnonClient in Test-/Build-Kontexten ohne gesetzte Env-Vars schon beim
// Modul-Load, und die pure-Funktionen (mapArtikelToFeedItem) waeren nicht mehr importierbar.
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
 * Merged mdxItems + dbItems, sortiert nach pubDate desc, dedupiert nach guid.
 * Pure Hilfsfunktion (kein DB-Call) — direkt testbar.
 * Dedupe-Strategie: erster Treffer gewinnt (mdxItems haben Vorrang bei Kollision).
 */
export function mergeAndSortItems(mdxItems: FeedItem[], dbItems: FeedItem[]): FeedItem[] {
  const seen = new Set<string>()
  const result: FeedItem[] = []
  for (const item of [...mdxItems, ...dbItems]) {
    if (!seen.has(item.guid)) {
      seen.add(item.guid)
      result.push(item)
    }
  }
  return result.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
}

/**
 * Stabiler Fallback-Stand fuer DB-Artikel ohne last_modified oder veroeffentlicht_am.
 * Bewusst ein fixes Vergangenheitsdatum statt build-zeitlichem new Date() —
 * gleiche Begruendung wie ASSET_DATE_FALLBACK in claimondo-mdx.ts:
 * ein wandernder pubDate ohne Content-Change verfaelscht den News-Feed.
 */
const ARTIKEL_DATE_FALLBACK = new Date('2024-01-01T00:00:00Z')

export type WissenArtikel = {
  id: string
  slug: string
  title: string
  body: string
  excerpt: string | null
  key_facts: string[]
  meta_description: string | null
  /** Kurzer SERP-Titel (<=48 Zeichen, das Layout haengt " | Claimondo" an = 60).
   *  Fallback bei NULL: `title`. Noetig, weil `title` zugleich die sichtbare H1
   *  des Artikels ist und lang/beschreibend bleiben soll. Analog zum
   *  meta_title-Frontmatter der MDX-Assets (claimondo-mdx.ts). */
  meta_title: string | null
  primary_keyword: string | null
  cluster: string | null
  artikel_typ: string | null
  last_modified: string | null // date column -> YYYY-MM-DD string
  veroeffentlicht_am: string | null // timestamptz -> ISO string
  author: string
  audience: string
  quelle: string
}

const SELECT_COLUMNS =
  'id,slug,title,body,excerpt,key_facts,meta_description,meta_title,primary_keyword,cluster,artikel_typ,last_modified,veroeffentlicht_am,author,audience,quelle'

/**
 * Einen veroeffentlichten Artikel per Slug laden (anon-Client, RLS-gated).
 * Gibt null zurueck wenn kein Artikel mit status='veroeffentlicht' und dem Slug existiert.
 */
export async function getPublishedArtikelBySlug(slug: string): Promise<WissenArtikel | null> {
  const { data, error } = await anonClient()
    .from('wissen_artikel')
    .select(SELECT_COLUMNS)
    .eq('slug', slug)
    .eq('status', 'veroeffentlicht')
    .maybeSingle()
  if (error) {
    console.error('[wissen] getPublishedArtikelBySlug error:', error.message)
    return null
  }
  return data as WissenArtikel | null
}

/**
 * Alle veroeffentlichten Artikel, neueste zuerst (nach last_modified desc, dann veroeffentlicht_am desc).
 */
export async function getPublishedArtikel(): Promise<WissenArtikel[]> {
  const { data, error } = await anonClient()
    .from('wissen_artikel')
    .select(SELECT_COLUMNS)
    .eq('status', 'veroeffentlicht')
    .order('last_modified', { ascending: false })
    .order('veroeffentlicht_am', { ascending: false })
  if (error) {
    console.error('[wissen] getPublishedArtikel error:', error.message)
    return []
  }
  return (data ?? []) as WissenArtikel[]
}

/**
 * WissenArtikel -> FeedItem (pure, kein DB-Call, direkt testbar).
 * pubDate-Hierarchie: last_modified > veroeffentlicht_am > ARTIKEL_DATE_FALLBACK.
 * link = relativer Pfad /wissen/<slug> (kein SITE_URL-Prefix; Feed-Consumer addiert ggf. Domain).
 */
export function mapArtikelToFeedItem(a: WissenArtikel): FeedItem {
  const link = `/wissen/${a.slug}`

  let pubDate: Date = ARTIKEL_DATE_FALLBACK
  if (a.last_modified) {
    const d = new Date(a.last_modified)
    if (!Number.isNaN(d.getTime())) pubDate = d
  } else if (a.veroeffentlicht_am) {
    const d = new Date(a.veroeffentlicht_am)
    if (!Number.isNaN(d.getTime())) pubDate = d
  }

  const categories = [
    a.cluster ?? '',
    a.artikel_typ ?? 'Wissen',
  ].filter(Boolean)

  const sortKey = `6-wissen-${a.cluster ?? ''}-${a.title}`

  return {
    title: a.title,
    link,
    guid: link,
    pubDate,
    assetType: 'Spoke',
    categories,
    author: a.author || DEFAULT_AUTHOR,
    excerpt: a.excerpt ?? '',
    keyFacts: a.key_facts ?? [],
    sortKey,
  }
}

/**
 * Teilt veroeffentlichte Artikel nach Zielgruppe auf. Pure — kein DB-Call.
 * consumer = Geschaedigten-Ratgeber, b2b = Fachartikel (SV/Kanzlei/Werkstatt).
 * Nicht-'b2b' faellt bewusst auf consumer (sichere Default fuer die Geschaedigten-Surface).
 * Reihenfolge bleibt erhalten (getPublishedArtikel liefert newest-first).
 */
export function groupByAudience(items: WissenArtikel[]): {
  consumer: WissenArtikel[]
  b2b: WissenArtikel[]
} {
  const consumer: WissenArtikel[] = []
  const b2b: WissenArtikel[] = []
  for (const a of items) {
    if (a.audience === 'b2b') b2b.push(a)
    else consumer.push(a)
  }
  return { consumer, b2b }
}
