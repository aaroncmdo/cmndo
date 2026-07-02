import { createClient as createAnonClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Cookie-loser Anon-Client fuer OEFFENTLICHE Community-/Wissen-Daten.
// Gleiche Begruendung wie db-articles.ts: build-zeit-sicher fuer force-static-Routen,
// kein User-Context noetig, RLS erzwingt status-Filter.
// Lazy: erst beim ersten Query instanziieren — pure Funktionen (mergeFeed)
// bleiben importierbar ohne ENV-Zugriff.
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedEntry = {
  kind: 'artikel' | 'post'
  id: string
  title: string | null
  body: string
  authorDisplay: string
  isRedaktion: boolean
  tags: string[]
  createdAt: string
  likeCount: number
  commentCount: number
  slug: string | null
}

export type CommentRow = {
  id: string
  authorDisplay: string
  body: string
  parentId: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Merged zwei FeedEntry-Arrays und sortiert nach createdAt desc.
 * Pure Funktion — kein DB-Call, direkt testbar.
 */
export function mergeFeed(a: FeedEntry[], b: FeedEntry[]): FeedEntry[] {
  return [...a, ...b].sort(
    (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime(),
  )
}

// ---------------------------------------------------------------------------
// getCommunityFeed
// ---------------------------------------------------------------------------

/**
 * Laedt den B2B-Community-Feed:
 *   - wissen_artikel (audience='b2b', status='veroeffentlicht') → isRedaktion=true
 *   - community_posts (status='sichtbar') → isRedaktion=false
 * Optionaler tag-Filter via Array-Operator (@>). Like- und Kommentar-Counts
 * werden in ZWEI Batch-Queries geladen (eine fuer Likes, eine fuer Kommentare)
 * statt N+1 — die IDs aller Items werden gesammelt und dann gefiltert.
 */
export async function getCommunityFeed(tag?: string): Promise<FeedEntry[]> {
  const client = anonClient()

  // --- Artikel ---
  let artikelQuery = client
    .from('wissen_artikel')
    .select('id, title, body, excerpt, slug, tags, last_modified, veroeffentlicht_am, created_at')
    .eq('status', 'veroeffentlicht')
    .eq('audience', 'b2b')
    .order('last_modified', { ascending: false })
    .order('veroeffentlicht_am', { ascending: false })

  if (tag) {
    // text[] @> text[]: Zeilen die den Tag enthalten
    artikelQuery = artikelQuery.contains('tags', [tag])
  }

  const { data: artikelData, error: artikelError } = await artikelQuery
  if (artikelError) {
    console.error('[community] getCommunityFeed artikel error:', artikelError.message)
  }

  // --- Posts ---
  let postsQuery = client
    .from('community_posts')
    .select('id, body, author_display, tags, created_at')
    .eq('status', 'sichtbar')
    .order('created_at', { ascending: false })

  if (tag) {
    postsQuery = postsQuery.contains('tags', [tag])
  }

  const { data: postsData, error: postsError } = await postsQuery
  if (postsError) {
    console.error('[community] getCommunityFeed posts error:', postsError.message)
  }

  const artikelRows = (artikelData ?? []) as Array<{
    id: string
    title: string
    body: string
    excerpt: string | null
    slug: string
    tags: string[]
    last_modified: string | null
    veroeffentlicht_am: string | null
    created_at: string | null
  }>

  const postRows = (postsData ?? []) as Array<{
    id: string
    body: string
    author_display: string
    tags: string[]
    created_at: string
  }>

  // Collect all IDs per kind for batch count queries
  const artikelIds = artikelRows.map((r) => r.id)
  const postIds = postRows.map((r) => r.id)
  const allIds = [...artikelIds, ...postIds]

  if (allIds.length === 0) return []

  // --- Batch: Likes (single query, filter by target_kind+id combinations) ---
  // Wir laden alle Likes fuer wissen- und post-Targets in zwei Queries:
  const [{ data: artikelLikes }, { data: postLikes }] = await Promise.all([
    artikelIds.length > 0
      ? client
          .from('community_likes')
          .select('target_id')
          .eq('target_kind', 'wissen')
          .in('target_id', artikelIds)
      : Promise.resolve({ data: [] }),
    postIds.length > 0
      ? client
          .from('community_likes')
          .select('target_id')
          .eq('target_kind', 'post')
          .in('target_id', postIds)
      : Promise.resolve({ data: [] }),
  ])

  // --- Batch: Comments (single query per kind) ---
  const [{ data: artikelComments }, { data: postComments }] = await Promise.all([
    artikelIds.length > 0
      ? client
          .from('community_comments')
          .select('target_id')
          .eq('target_kind', 'wissen')
          .eq('status', 'sichtbar')
          .in('target_id', artikelIds)
      : Promise.resolve({ data: [] }),
    postIds.length > 0
      ? client
          .from('community_comments')
          .select('target_id')
          .eq('target_kind', 'post')
          .eq('status', 'sichtbar')
          .in('target_id', postIds)
      : Promise.resolve({ data: [] }),
  ])

  // Build count maps
  function countById(rows: Array<{ target_id: string }> | null): Record<string, number> {
    const map: Record<string, number> = {}
    for (const r of rows ?? []) {
      map[r.target_id] = (map[r.target_id] ?? 0) + 1
    }
    return map
  }

  const artikelLikeCount = countById(artikelLikes as Array<{ target_id: string }> | null)
  const postLikeCount = countById(postLikes as Array<{ target_id: string }> | null)
  const artikelCommentCount = countById(artikelComments as Array<{ target_id: string }> | null)
  const postCommentCount = countById(postComments as Array<{ target_id: string }> | null)

  // Map Artikel → FeedEntry
  const FALLBACK_DATE = '2024-01-01T00:00:00Z'
  const artikelEntries: FeedEntry[] = artikelRows.map((r) => {
    const createdAt = r.last_modified ?? r.veroeffentlicht_am ?? r.created_at ?? FALLBACK_DATE
    return {
      kind: 'artikel',
      id: r.id,
      title: r.title,
      body: r.excerpt ?? r.body,
      authorDisplay: 'Claimondo Redaktion',
      isRedaktion: true,
      tags: r.tags ?? [],
      createdAt,
      likeCount: artikelLikeCount[r.id] ?? 0,
      commentCount: artikelCommentCount[r.id] ?? 0,
      slug: r.slug,
    }
  })

  // Map Posts → FeedEntry
  const postEntries: FeedEntry[] = postRows.map((r) => ({
    kind: 'post',
    id: r.id,
    title: null,
    body: r.body,
    authorDisplay: r.author_display,
    isRedaktion: false,
    tags: r.tags ?? [],
    createdAt: r.created_at,
    likeCount: postLikeCount[r.id] ?? 0,
    commentCount: postCommentCount[r.id] ?? 0,
    slug: null,
  }))

  return mergeFeed(artikelEntries, postEntries)
}

// ---------------------------------------------------------------------------
// getThread
// ---------------------------------------------------------------------------

/**
 * Laedt alle sichtbaren Kommentare fuer einen Post oder Wissen-Artikel und splittet
 * sie in top-level (parent_id=null) und Replies (gruppiert nach parent_id).
 * Nur 1 Reply-Ebene gemaess MVP-Scope.
 */
export async function getThread(
  targetKind: 'post' | 'wissen',
  targetId: string,
): Promise<{
  top: CommentRow[]
  repliesByParent: Record<string, CommentRow[]>
}> {
  const { data, error } = await anonClient()
    .from('community_comments')
    .select('id, author_display, body, parent_id, created_at')
    .eq('target_kind', targetKind)
    .eq('target_id', targetId)
    .eq('status', 'sichtbar')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[community] getThread error:', error.message)
    return { top: [], repliesByParent: {} }
  }

  const rows = (data ?? []) as Array<{
    id: string
    author_display: string
    body: string
    parent_id: string | null
    created_at: string
  }>

  const top: CommentRow[] = []
  const repliesByParent: Record<string, CommentRow[]> = {}

  for (const r of rows) {
    const mapped: CommentRow = {
      id: r.id,
      authorDisplay: r.author_display,
      body: r.body,
      parentId: r.parent_id,
      createdAt: r.created_at,
    }
    if (r.parent_id === null) {
      top.push(mapped)
    } else {
      if (!repliesByParent[r.parent_id]) repliesByParent[r.parent_id] = []
      repliesByParent[r.parent_id].push(mapped)
    }
  }

  return { top, repliesByParent }
}

// ---------------------------------------------------------------------------
// getUserLikedKeys
// ---------------------------------------------------------------------------

/**
 * Laedt die Like-Keys des eingeloggten Users fuer alle Eintraege im Feed.
 * Nutzt den Cookie-basierten User-Client (nicht den Anon-Client), da
 * user_id benoetigt wird. Gibt Strings der Form `kind:id` zurueck.
 */
export async function getUserLikedKeys(entries: FeedEntry[]): Promise<string[]> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return []

  const allIds = entries.map((e) => e.id)
  if (allIds.length === 0) return []

  const { data, error } = await supabase
    .from('community_likes')
    .select('target_kind, target_id')
    .eq('user_id', auth.user.id)
    .in('target_id', allIds)

  if (error) {
    console.error('[community] getUserLikedKeys error:', error.message)
    return []
  }

  return (data ?? []).map(
    (row: { target_kind: string; target_id: string }) => `${row.target_kind}:${row.target_id}`,
  )
}
