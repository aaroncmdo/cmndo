'use server'

import { createClient } from '@/lib/supabase/server'
import { SITE_URL } from '@/lib/seo/jsonld'
import { revalidatePath } from 'next/cache'
import { validateUsername } from './username'

function isEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
}

export async function requestCommentLogin(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const slug = String(formData.get('slug') ?? '')
  if (!isEmail(email)) return { ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }
  const next = slug ? `/${slug}` : '/'
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  })
  if (error) return { ok: false, error: 'Magic-Link konnte nicht gesendet werden. Bitte später erneut versuchen.' }
  return { ok: true }
}

export async function ensureUsername(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const v = validateUsername(String(formData.get('username') ?? ''))
  if (!v.ok) return { ok: false, error: v.error }
  if (formData.get('consent') !== 'on') return { ok: false, error: 'Bitte den Hinweis zur Datenverarbeitung bestätigen.' }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst per E-Mail anmelden.' }
  const { error } = await supabase
    .from('community_profiles')
    .insert({ user_id: auth.user.id, username: v.username })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Dieser Nutzername ist bereits vergeben.' }
    return { ok: false, error: 'Nutzername konnte nicht gespeichert werden.' }
  }
  return { ok: true }
}

export async function submitComment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const body = String(formData.get('body') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim()
  if (body.length < 1 || body.length > 2000) return { ok: false, error: 'Kommentar: 1–2000 Zeichen.' }
  if (!slug) return { ok: false, error: 'Artikel fehlt.' }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: 'Bitte zuerst anmelden.' }
  const { error } = await supabase
    .from('article_comments')
    .insert({ author_id: auth.user.id, article_slug: slug, body })
  if (error) return { ok: false, error: 'Kommentar konnte nicht gespeichert werden.' }
  revalidatePath(`/${slug}`)
  return { ok: true }
}
