'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Bereinigt Postgres-Exception-Messages: entfernt technische Prefixe wie
 * "ERROR:  " oder "P0001: " damit die deutsche Nachricht direkt angezeigt wird.
 */
function mapRpcError(message: string): string {
  return message
    .replace(/^ERROR:\s+/i, '')
    .replace(/^[A-Z0-9]{5}:\s+/i, '')
    .trim()
}

export async function createCommunityPost(
  body: string,
  tags: string[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden.' }

  // Soft-Launch- + Partner/Admin-Gating passiert AUSSCHLIESSLICH in der RPC
  // create_community_post (v_public_posts_enabled + _community_author = Single Source
  // of Truth). NICHT hier duplizieren: die fruehere Action-Heuristik driftete
  // (profiles.firma ist leer; is_admin() nimmt keine Argumente) und sperrte echte
  // Partner + Admins aus. Die RPC liefert bereits die passende deutsche Fehlermeldung.
  const { error } = await supabase.rpc('create_community_post', {
    p_body: body,
    p_tags: tags,
  })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  revalidatePath('/')
  return { ok: true }
}

export async function createCommunityComment(
  targetKind: string,
  targetId: string,
  body: string,
  parentId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden.' }

  const { error } = await supabase.rpc('create_community_comment', {
    p_target_kind: targetKind,
    p_target_id: targetId,
    p_body: body,
    p_parent_id: parentId ?? null,
  })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  revalidatePath('/')
  return { ok: true }
}

export async function toggleCommunityLike(
  targetKind: string,
  targetId: string,
): Promise<{ ok: boolean; nowLiked?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden.' }

  const { data, error } = await supabase.rpc('toggle_like', {
    p_target_kind: targetKind,
    p_target_id: targetId,
  })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  revalidatePath('/')
  return { ok: true, nowLiked: !!data }
}

export async function reportCommunityTarget(
  kind: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden, um einen Beitrag zu melden.' }

  const { error } = await supabase.rpc('report_target', {
    p_kind: kind,
    p_id: id,
  })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  return { ok: true }
}
