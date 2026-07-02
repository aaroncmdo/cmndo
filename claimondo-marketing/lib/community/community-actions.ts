'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Soft-Launch-Schalter: false = nur Partner/Admin posten; Public liest + kommentiert.
// Auf true setzen nach DSB-OK (DPIA-Erweiterung abgeschlossen).
// NICHT exportieren — Konstanten aus 'use server'-Files sind im Client-Bundle undefined (AAR-664).
const PUBLIC_POST_ENABLED = false

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

  if (!PUBLIC_POST_ENABLED) {
    // Pruefe ob Partner oder Admin — nur diese duerfen bei Soft-Launch posten.
    // Einfachste Heuristik: Profil in profiles mit nicht-leerem firma-Feld = Partner,
    // oder is_admin() via RPC. Kein Profil = public.
    const { data: profileData } = await supabase
      .from('profiles')
      .select('firma')
      .eq('id', auth.user.id)
      .maybeSingle()
    const isPartner = !!((profileData as { firma?: string } | null)?.firma?.trim())
    // Admin-Check via RPC
    const { data: isAdminData } = await supabase.rpc('is_admin', { uid: auth.user.id })
    const isAdmin = !!isAdminData
    if (!isPartner && !isAdmin) {
      return { ok: false, error: 'Beitraege aktuell nur fuer Partner' }
    }
  }

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
