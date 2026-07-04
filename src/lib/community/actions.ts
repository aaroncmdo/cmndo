'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getThread } from './threads'
import type { CommentRow } from './threads'

const NETZWERK_ROUTES = ['/gutachter/netzwerk', '/makler/netzwerk', '/werkstatt/netzwerk', '/makler', '/werkstatt']
function revalidateNetzwerk() { for (const r of NETZWERK_ROUTES) revalidatePath(r) }

function mapRpcError(message: string): string {
  return message.replace(/^ERROR:\s+/i, '').replace(/^[A-Z0-9]{5}:\s+/i, '').trim()
}

export async function postBeitrag(body: string, tags: string[]): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden.' }
  const { error } = await supabase.rpc('create_community_post', { p_body: body, p_tags: tags })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  revalidateNetzwerk()
  return { ok: true }
}

export async function postKommentar(
  targetKind: string, targetId: string, body: string, parentId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden.' }
  const { error } = await supabase.rpc('create_community_comment', {
    p_target_kind: targetKind, p_target_id: targetId, p_body: body, p_parent_id: parentId ?? null,
  })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  revalidateNetzwerk()
  return { ok: true }
}

export async function toggleGefaelltMir(
  targetKind: string, targetId: string,
): Promise<{ ok: boolean; nowLiked?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden.' }
  const { data, error } = await supabase.rpc('toggle_like', { p_target_kind: targetKind, p_target_id: targetId })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  revalidateNetzwerk()
  return { ok: true, nowLiked: !!data }
}

export async function melden(kind: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden, um zu melden.' }
  // Kommentare via report_comment, Posts/Artikel via report_target.
  const { error } = kind === 'comment'
    ? await supabase.rpc('report_comment', { p_comment_id: id })
    : await supabase.rpc('report_target', { p_kind: kind, p_id: id })
  if (error) return { ok: false, error: mapRpcError(error.message) }
  return { ok: true }
}

export async function ladeThread(
  targetKind: 'post' | 'wissen', targetId: string,
): Promise<{ top: CommentRow[]; repliesByParent: Record<string, CommentRow[]> }> {
  return getThread(targetKind, targetId)
}
