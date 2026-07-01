'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'

async function setStatus(id: string, status: 'approved' | 'rejected' | 'hidden'): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Nur Admin.' }
  const db = createAdminClient()
  const { error } = await db
    .from('article_comments')
    .update({ status, moderated_at: new Date().toISOString(), report_count: 0 })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/kommentare')
  return { ok: true }
}

export async function approveComment(id: string) { return setStatus(id, 'approved') }
export async function rejectComment(id: string) { return setStatus(id, 'rejected') }
export async function hideComment(id: string) { return setStatus(id, 'hidden') }

export async function blockUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Nur Admin.' }
  const db = createAdminClient()
  const { error } = await db.from('community_profiles').update({ is_blocked: true }).eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/kommentare')
  return { ok: true }
}
