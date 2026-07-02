'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'

// ---------------------------------------------------------------------------
// Hilfsfunktion: setzt status + moderated_von + moderated_am + report_count=0
// ---------------------------------------------------------------------------

async function setPostStatus(
  id: string,
  status: 'versteckt' | 'geloescht',
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: 'Nur Admin.' }
  const db = createAdminClient()
  const { error } = await db
    .from('community_posts')
    .update({
      status,
      moderated_von: guard.user.id,
      moderated_am: new Date().toISOString(),
      report_count: 0,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/community')
  return { ok: true }
}

async function setCommentStatus(
  id: string,
  status: 'versteckt' | 'geloescht',
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: 'Nur Admin.' }
  const db = createAdminClient()
  const { error } = await db
    .from('community_comments')
    .update({
      status,
      moderated_von: guard.user.id,
      moderated_am: new Date().toISOString(),
      report_count: 0,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/community')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Oeffentliche Actions — Posts
// ---------------------------------------------------------------------------

export async function hidePost(id: string) {
  return setPostStatus(id, 'versteckt')
}

export async function deletePost(id: string) {
  return setPostStatus(id, 'geloescht')
}

// ---------------------------------------------------------------------------
// Oeffentliche Actions — Kommentare
// ---------------------------------------------------------------------------

export async function hideComment(id: string) {
  return setCommentStatus(id, 'versteckt')
}

export async function deleteComment(id: string) {
  return setCommentStatus(id, 'geloescht')
}

// ---------------------------------------------------------------------------
// Nutzer sperren
// ---------------------------------------------------------------------------

export async function blockUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: 'Nur Admin.' }
  const db = createAdminClient()
  const { error } = await db
    .from('community_profiles')
    .update({ is_blocked: true })
    .eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/community')
  return { ok: true }
}
