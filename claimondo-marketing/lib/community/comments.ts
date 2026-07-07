import { createClient } from '@/lib/supabase/server'

export interface CommentRow {
  id: string
  username: string
  body: string
  createdAt: string
}

// author_display wird von submitComment aus der aufgeloesten Community-Identitaet
// (community_my_identity -> Partner-Firma bzw. Community-Username) gesetzt. Der frueher
// noetige community_profiles-Join entfaellt (FK jetzt auf auth.users), damit registrierte
// Partner OHNE community_profiles-Zeile unter ihrer Firma kommentieren koennen.
export function mapCommentRows(
  rows: Array<{ id: string; body: string; created_at: string; author_display: string | null }>,
): CommentRow[] {
  return rows.map((r) => ({
    id: r.id,
    username: r.author_display?.trim() || 'unbekannt',
    body: r.body,
    createdAt: r.created_at,
  }))
}

export async function listApprovedComments(slug: string): Promise<CommentRow[]> {
  const supabase = await createClient()
  // author_display ist neu (Migration 20260706222056) und noch nicht in den generierten
  // Marketing-Typen -> gezielt casten (Marketing-Idiom bei Typen-Lag, vgl. embed/config).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('article_comments') as any)
    .select('id, body, created_at, author_display')
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
  // community_my_identity (Migration 20260706221505) loest Partner (Firma/Ansprechpartner)
  // ODER Community-Username auf. Als `username` zurueckgeben, damit alle Formulare (Artikel +
  // Feed) die manuelle Nutzernamen-Stage fuer bereits erkannte Partner ueberspringen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc('community_my_identity')
  const id = (Array.isArray(data) ? data[0] : data) as { display: string | null } | null
  return { isLoggedIn: true, username: id?.display ?? null }
}
