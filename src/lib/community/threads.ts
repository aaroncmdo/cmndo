import { createClient } from '@/lib/supabase/server'
import type { FeedEntry } from './feed'

export type CommentRow = {
  id: string; authorDisplay: string; authorKind: string; isRedaktion: boolean
  body: string; parentId: string | null; createdAt: string; likeCount: number
}
export type CommentPreview = { comment: CommentRow; topReply: CommentRow | null; replyCount: number }

function isMissingRelation(err: { code?: string } | null): boolean {
  return err?.code === '42P01'
}
// Sort desc nach Likes, Tiebreak neueste (createdAt desc).
function byTop(a: CommentRow, b: CommentRow): number {
  if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

// Pure: Top-N Kommentare + je Top-Antwort. Testbar ohne DB.
export function rankTopComments(
  top: CommentRow[],
  repliesByParent: Record<string, CommentRow[]>,
  maxComments = 2,
): CommentPreview[] {
  return [...top].sort(byTop).slice(0, maxComments).map(comment => {
    const replies = repliesByParent[comment.id] ?? []
    const topReply = replies.length ? [...replies].sort(byTop)[0] : null
    return { comment, topReply, replyCount: replies.length }
  })
}

const mapRow = (r: {
  id: string; author_display: string; author_kind: string; body: string
  parent_id: string | null; created_at: string
}, likeCount: number): CommentRow => ({
  id: r.id, authorDisplay: r.author_display, authorKind: r.author_kind,
  isRedaktion: r.author_kind === 'admin', body: r.body, parentId: r.parent_id,
  createdAt: r.created_at, likeCount,
})

async function loadCommentLikeCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  commentIds: string[],
): Promise<Record<string, number>> {
  if (!commentIds.length) return {}
  const { data } = await supabase
    .from('community_likes').select('target_id')
    .eq('target_kind', 'comment').in('target_id', commentIds)
  const m: Record<string, number> = {}
  for (const r of (data ?? []) as Array<{ target_id: string }>) m[r.target_id] = (m[r.target_id] ?? 0) + 1
  return m
}

export async function getThread(
  targetKind: 'post' | 'wissen',
  targetId: string,
): Promise<{ top: CommentRow[]; repliesByParent: Record<string, CommentRow[]> }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('community_comments')
    .select('id, author_display, author_kind, body, parent_id, created_at')
    .eq('target_kind', targetKind).eq('target_id', targetId).eq('status', 'sichtbar')
    .order('created_at', { ascending: true })
  if (isMissingRelation(error) || error) {
    if (error && !isMissingRelation(error)) console.error('[netzwerk] getThread:', error.message)
    return { top: [], repliesByParent: {} }
  }
  const rows = (data ?? []) as Array<{
    id: string; author_display: string; author_kind: string; body: string; parent_id: string | null; created_at: string
  }>
  const likeCounts = await loadCommentLikeCounts(supabase, rows.map(r => r.id))
  const top: CommentRow[] = []
  const repliesByParent: Record<string, CommentRow[]> = {}
  for (const r of rows) {
    const mapped = mapRow(r, likeCounts[r.id] ?? 0)
    if (r.parent_id === null) top.push(mapped)
    else (repliesByParent[r.parent_id] ??= []).push(mapped)
  }
  return { top, repliesByParent }
}

// Batch: pro Feed-Eintrag Top-2 Kommentare + Top-Antwort. Key "${kind}:${id}".
export async function getTopCommentsPreview(
  entries: FeedEntry[],
): Promise<Record<string, CommentPreview[]>> {
  const supabase = await createClient()
  const artikelIds = entries.filter(e => e.kind === 'artikel').map(e => e.id)
  const postIds = entries.filter(e => e.kind === 'post').map(e => e.id)
  if (!artikelIds.length && !postIds.length) return {}

  const [{ data: aData, error: aErr }, { data: pData, error: pErr }] = await Promise.all([
    artikelIds.length ? supabase.from('community_comments').select('id, target_kind, target_id, author_display, author_kind, body, parent_id, created_at').eq('target_kind', 'wissen').eq('status', 'sichtbar').in('target_id', artikelIds) : Promise.resolve({ data: [], error: null }),
    postIds.length ? supabase.from('community_comments').select('id, target_kind, target_id, author_display, author_kind, body, parent_id, created_at').eq('target_kind', 'post').eq('status', 'sichtbar').in('target_id', postIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (isMissingRelation(aErr) || isMissingRelation(pErr)) return {}

  const rows = [...(aData ?? []), ...(pData ?? [])] as Array<{
    id: string; target_kind: string; target_id: string; author_display: string
    author_kind: string; body: string; parent_id: string | null; created_at: string
  }>
  const likeCounts = await loadCommentLikeCounts(supabase, rows.map(r => r.id))

  // Gruppiere pro Feed-Key (kind:id). target_kind 'wissen' -> Feed-kind 'artikel'.
  const feedKind = (tk: string) => (tk === 'wissen' ? 'artikel' : 'post')
  const grouped: Record<string, { top: CommentRow[]; repliesByParent: Record<string, CommentRow[]> }> = {}
  for (const r of rows) {
    const key = `${feedKind(r.target_kind)}:${r.target_id}`
    ;(grouped[key] ??= { top: [], repliesByParent: {} })
    const mapped = mapRow(r, likeCounts[r.id] ?? 0)
    if (r.parent_id === null) grouped[key].top.push(mapped)
    else (grouped[key].repliesByParent[r.parent_id] ??= []).push(mapped)
  }
  const out: Record<string, CommentPreview[]> = {}
  for (const [key, { top, repliesByParent }] of Object.entries(grouped)) {
    out[key] = rankTopComments(top, repliesByParent)
  }
  return out
}
