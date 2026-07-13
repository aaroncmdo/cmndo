'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { verarbeiteJob } from '@/lib/marketing/orchestrator'
import { checkGuardrails } from '@/lib/marketing/guardrails'
import type { ContentFormat } from '@/lib/marketing/schema'

async function ensureAdmin(): Promise<{ ok: boolean; error?: string; userId?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nur Admins.' }
  return { ok: true, userId: user.id }
}

export async function erstelleClip(
  thema: string,
  format: ContentFormat,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!thema.trim()) return { ok: false, error: 'Bitte ein Thema eingeben.' }
  if (format !== 'ratgeber' && format !== 'ad') return { ok: false, error: 'Ungültiges Format.' }

  const db = createAdminClient()

  // Guardrail (Wochen-Cap + Kill-Switch) VOR dem Anlegen, damit der Nutzer sofort Feedback bekommt.
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { count } = await db
    .from('marketing_content_jobs')
    .select('id', { count: 'exact', head: true })
    .gte('erstellt_am', since)
  const guard = checkGuardrails(count ?? 0)
  if (!guard.ok) return { ok: false, error: guard.error }

  const { data: job, error } = await db
    .from('marketing_content_jobs')
    .insert({ thema: thema.trim(), format, erstellt_von: auth.userId })
    .select('id')
    .single()
  if (error || !job) return { ok: false, error: error?.message ?? 'Job konnte nicht angelegt werden.' }

  // Hintergrund-Verarbeitung: der App-Server laeuft persistent (output:standalone + PM2 auf VPS),
  // daher ueberlebt fire-and-forget den Request. Robuster Follow-up: Cron-Worker (Slice 3).
  void verarbeiteJob(job.id, createAdminClient()).catch((e) =>
    console.error('[marketing] verarbeiteJob failed', e),
  )

  revalidatePath('/admin/marketing/content-studio')
  return { ok: true }
}
