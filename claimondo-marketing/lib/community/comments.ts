import { createClient } from '@/lib/supabase/server'

export interface CommentRow {
  id: string
  username: string
  body: string
  createdAt: string
}

// Supabase liefert das gejointe Profil je nach Cardinality als Objekt|Array|null -> defensiv normalisieren.
export function mapCommentRows(
  rows: Array<{ id: string; body: string; created_at: string; community_profiles: unknown }>,
): CommentRow[] {
  return rows.map((r) => {
    const p = Array.isArray(r.community_profiles) ? r.community_profiles[0] : r.community_profiles
    const username = (p as { username?: string } | null)?.username ?? 'unbekannt'
    return { id: r.id, username, body: r.body, createdAt: r.created_at }
  })
}

export async function listApprovedComments(slug: string): Promise<CommentRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('article_comments')
    .select('id, body, created_at, community_profiles(username)')
    .eq('article_slug', slug)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return mapCommentRows(data as never)
}

export async function getAuthState(): Promise<{ isLoggedIn: boolean; username: string | null }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { isLoggedIn: false, username: null }
  const { data } = await supabase
    .from('community_profiles')
    .select('username')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  return { isLoggedIn: true, username: data?.username ?? null }
}
