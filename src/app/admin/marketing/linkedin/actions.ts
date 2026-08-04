// src/app/admin/marketing/linkedin/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidLinkedInToken } from '@/lib/linkedin/token'
import { PostsApiPublisher } from '@/lib/linkedin/publisher'
import { buildAuthorizeUrl } from '@/lib/linkedin/oauth'
import type { LinkedInPostRow } from '@/lib/linkedin/types'

const QUEUE_PATH = '/admin/marketing/linkedin'

async function alertAdmins(titel: string, inhalt: string) {
  try {
    const admin = createAdminClient()
    const { data: admins } = await admin.from('profiles').select('id').eq('rolle', 'admin')
    if (admins && admins.length > 0) {
      const { createMitteilungMulti } = await import('@/lib/mitteilungen/create-mitteilung')
      await createMitteilungMulti(
        admins.map((a: { id: string }) => ({ id: a.id, rolle: 'admin' as const })),
        { kategorie: 'update', titel, inhalt, route_url: QUEUE_PATH, icon: 'bell', prioritaet: 'normal' },
      )
    }
  } catch (e) {
    console.error('[linkedin] admin alert failed:', e)
  }
}

export async function freigebenUndPosten(id: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['admin'])
  const admin = createAdminClient()
  const { data } = await admin.from('linkedin_posts').select('*').eq('id', id).maybeSingle()
  const row = data as LinkedInPostRow | null
  if (!row) return { ok: false, error: 'Entwurf nicht gefunden.' }
  if (row.status === 'veroeffentlicht') return { ok: false, error: 'Bereits veröffentlicht.' }

  const now = new Date().toISOString()
  // Atomic claim: only one caller transitions entwurf -> veroeffentlicht.
  const { data: claimed } = await admin
    .from('linkedin_posts')
    .update({ status: 'veroeffentlicht', freigegeben_von: user.id, freigegeben_am: now, fehler: null })
    .eq('id', id)
    .eq('status', 'entwurf')
    .select('id')
  if (!claimed || claimed.length === 0) {
    revalidatePath(QUEUE_PATH)
    return { ok: false, error: 'Entwurf wird bereits verarbeitet oder ist nicht mehr offen.' }
  }

  const tok = await getValidLinkedInToken()
  if (!tok.ok) {
    // release the claim so it can be retried
    await admin.from('linkedin_posts').update({ status: 'entwurf', freigegeben_von: null, freigegeben_am: null }).eq('id', id)
    revalidatePath(QUEUE_PATH)
    return { ok: false, error: tok.error }
  }

  const publisher = new PostsApiPublisher(tok.token)
  const res = await publisher.publish({
    authorUrn: row.author_urn, text: row.composed_text, link: row.feed_url,
    title: row.title, description: row.excerpt ?? '',
  })
  if (!res.ok) {
    await admin.from('linkedin_posts').update({ status: 'fehlgeschlagen', fehler: res.error }).eq('id', id)
    await alertAdmins('LinkedIn-Post fehlgeschlagen', `„${row.title}" konnte nicht veröffentlicht werden: ${res.error}`)
    revalidatePath(QUEUE_PATH)
    return { ok: false, error: res.error }
  }

  const { error: urnErr } = await admin.from('linkedin_posts').update({ linkedin_post_urn: res.postUrn, published_at: now }).eq('id', id)
  if (urnErr) console.error('[linkedin] post live but URN persist failed:', urnErr.message) // never log tokens
  revalidatePath(QUEUE_PATH)
  return { ok: true }
}

export async function entwurfBearbeiten(id: string, text: string): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['admin'])
  if (!text.trim()) return { ok: false, error: 'Text darf nicht leer sein.' }
  const admin = createAdminClient()
  const { error } = await admin.from('linkedin_posts').update({ composed_text: text }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(QUEUE_PATH)
  return { ok: true }
}

export async function ueberspringen(id: string): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['admin'])
  const admin = createAdminClient()
  const { error } = await admin.from('linkedin_posts').update({ status: 'uebersprungen' }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(QUEUE_PATH)
  return { ok: true }
}

export async function startLinkedInConnect(): Promise<void> {
  await requirePortalAccess(['admin'])
  const state = crypto.randomUUID()
  const jar = await cookies()
  jar.set('li_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 })
  redirect(buildAuthorizeUrl(state))
}
