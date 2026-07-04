import { createClient } from '@/lib/supabase/server'

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

// Pure: mergbar + testbar ohne DB.
export function mergeFeed(a: FeedEntry[], b: FeedEntry[]): FeedEntry[] {
  return [...a, ...b].sort(
    (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime(),
  )
}

// Graceful: fehlt eine community-Tabelle (Staging noch nicht migriert), Code 42P01 → leer.
function isMissingRelation(err: { code?: string } | null): boolean {
  return err?.code === '42P01'
}

function countById(rows: Array<{ target_id: string }> | null): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of rows ?? []) map[r.target_id] = (map[r.target_id] ?? 0) + 1
  return map
}

export async function getNetzwerkFeed(
  opts: { tag?: string; limit?: number } = {},
): Promise<FeedEntry[]> {
  const supabase = await createClient()
  const { tag, limit } = opts

  let artikelQuery = supabase
    .from('wissen_artikel')
    .select('id, title, body, excerpt, slug, tags, last_modified, veroeffentlicht_am, created_at')
    .eq('status', 'veroeffentlicht')
    .eq('audience', 'b2b')
    .order('last_modified', { ascending: false })
    .order('veroeffentlicht_am', { ascending: false })
  if (tag) artikelQuery = artikelQuery.contains('tags', [tag])

  let postsQuery = supabase
    .from('community_posts')
    .select('id, body, author_display, tags, created_at')
    .eq('status', 'sichtbar')
    .order('created_at', { ascending: false })
  if (tag) postsQuery = postsQuery.contains('tags', [tag])

  const [{ data: artikelData, error: artikelError }, { data: postsData, error: postsError }] =
    await Promise.all([artikelQuery, postsQuery])

  if (isMissingRelation(artikelError) || isMissingRelation(postsError)) return []
  if (artikelError) console.error('[netzwerk] feed artikel:', artikelError.message)
  if (postsError) console.error('[netzwerk] feed posts:', postsError.message)

  const artikelRows = (artikelData ?? []) as Array<{
    id: string; title: string; body: string; excerpt: string | null; slug: string
    tags: string[]; last_modified: string | null; veroeffentlicht_am: string | null; created_at: string | null
  }>
  const postRows = (postsData ?? []) as Array<{
    id: string; body: string; author_display: string; tags: string[]; created_at: string
  }>

  const artikelIds = artikelRows.map(r => r.id)
  const postIds = postRows.map(r => r.id)
  if (artikelIds.length + postIds.length === 0) return []

  const [{ data: artikelLikes }, { data: postLikes }] = await Promise.all([
    artikelIds.length ? supabase.from('community_likes').select('target_id').eq('target_kind', 'wissen').in('target_id', artikelIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabase.from('community_likes').select('target_id').eq('target_kind', 'post').in('target_id', postIds) : Promise.resolve({ data: [] }),
  ])
  const [{ data: artikelComments }, { data: postComments }] = await Promise.all([
    artikelIds.length ? supabase.from('community_comments').select('target_id').eq('target_kind', 'wissen').eq('status', 'sichtbar').in('target_id', artikelIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabase.from('community_comments').select('target_id').eq('target_kind', 'post').eq('status', 'sichtbar').in('target_id', postIds) : Promise.resolve({ data: [] }),
  ])

  const aLike = countById(artikelLikes as Array<{ target_id: string }> | null)
  const pLike = countById(postLikes as Array<{ target_id: string }> | null)
  const aCom = countById(artikelComments as Array<{ target_id: string }> | null)
  const pCom = countById(postComments as Array<{ target_id: string }> | null)

  const FALLBACK = '2024-01-01T00:00:00Z'
  const artikelEntries: FeedEntry[] = artikelRows.map(r => ({
    kind: 'artikel', id: r.id, title: r.title, body: r.excerpt ?? r.body,
    authorDisplay: 'Claimondo Redaktion', isRedaktion: true, tags: r.tags ?? [],
    createdAt: r.last_modified ?? r.veroeffentlicht_am ?? r.created_at ?? FALLBACK,
    likeCount: aLike[r.id] ?? 0, commentCount: aCom[r.id] ?? 0, slug: r.slug,
  }))
  const postEntries: FeedEntry[] = postRows.map(r => ({
    kind: 'post', id: r.id, title: null, body: r.body, authorDisplay: r.author_display,
    isRedaktion: false, tags: r.tags ?? [], createdAt: r.created_at,
    likeCount: pLike[r.id] ?? 0, commentCount: pCom[r.id] ?? 0, slug: null,
  }))

  const merged = mergeFeed(artikelEntries, postEntries)
  return limit ? merged.slice(0, limit) : merged
}

export async function getUserLikedKeys(entries: FeedEntry[]): Promise<string[]> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return []
  const ids = entries.map(e => e.id)
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('community_likes').select('target_kind, target_id')
    .eq('user_id', auth.user.id).in('target_id', ids)
  if (isMissingRelation(error)) return []
  if (error) { console.error('[netzwerk] likedKeys:', error.message); return [] }
  return (data ?? []).map((r: { target_kind: string; target_id: string }) => `${r.target_kind}:${r.target_id}`)
}
