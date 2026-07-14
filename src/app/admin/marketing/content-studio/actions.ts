'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { generiereJobSkript } from '@/lib/marketing/orchestrator'
import { verarbeiteRenderQueue } from '@/lib/marketing/render-worker'
import { checkGuardrails } from '@/lib/marketing/guardrails'
import { ContentScriptSchema, type ContentFormat } from '@/lib/marketing/schema'

async function ensureAdmin(): Promise<{ ok: boolean; error?: string; userId?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nur Admins.' }
  return { ok: true, userId: user.id }
}

const LIST_PATH = '/admin/marketing/content-studio'
const detailPath = (id: string) => `/admin/marketing/content-studio/${id}`

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

  // Nur Phase A (Skript). Der Admin prueft/editiert im Studio + gibt frei -> dann rendert Phase B.
  // Fire-and-forget: App-Server laeuft persistent (output:standalone + PM2). Robuster: Cron (Slice 3).
  void generiereJobSkript(job.id, db).catch((e) => console.error('[marketing] generiereJobSkript failed', e))

  revalidatePath(LIST_PATH)
  return { ok: true }
}

/** Speichert das im Editor bearbeitete Skript nach Server-Validierung (skript + caption/hashtags-Spalten). */
export async function speichereSkript(
  jobId: string,
  skript: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const parsed = ContentScriptSchema.safeParse(skript)
  if (!parsed.success) {
    return { ok: false, error: 'Skript ungültig: ' + parsed.error.issues.map((i) => i.message).join('; ') }
  }
  const db = createAdminClient()
  const { error } = await db
    .from('marketing_content_jobs')
    .update({
      skript: parsed.data,
      caption: parsed.data.caption,
      hashtags: parsed.data.hashtags,
      aktualisiert_am: new Date().toISOString(),
    })
    .eq('id', jobId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(detailPath(jobId))
  return { ok: true }
}

/** Gibt das gepruefte Skript frei und startet die Render-Phase (Phase B). */
export async function freigebenUndRendern(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const db = createAdminClient()
  const { data: job, error } = await db
    .from('marketing_content_jobs')
    .select('id, status, skript')
    .eq('id', jobId)
    .single()
  if (error || !job) return { ok: false, error: 'Job nicht gefunden.' }
  if (job.status !== 'skript_generiert' && job.status !== 'fehler')
    return { ok: false, error: 'Freigabe nur aus dem Skript-Review möglich.' }
  if (!ContentScriptSchema.safeParse(job.skript).success)
    return { ok: false, error: 'Kein gültiges Skript — erst generieren/speichern.' }

  // In die Render-Queue stellen (Slice 3). Der Worker (Fast-Path hier + Cron-Backstop) rendert
  // serialisiert + RAM-gegated. UI zeigt "In Warteschlange" -> kein Doppel-Trigger.
  await db
    .from('marketing_content_jobs')
    .update({ status: 'render_queued', fehler_text: null, aktualisiert_am: new Date().toISOString() })
    .eq('id', jobId)
  void verarbeiteRenderQueue(db).catch((e) => console.error('[marketing] verarbeiteRenderQueue failed', e))

  revalidatePath(LIST_PATH)
  revalidatePath(detailPath(jobId))
  return { ok: true }
}

/** Verwirft das aktuelle Skript und generiert ein neues (Phase A). */
export async function regeneriereSkript(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const db = createAdminClient()
  const { data: job, error } = await db
    .from('marketing_content_jobs')
    .select('id, status')
    .eq('id', jobId)
    .single()
  if (error || !job) return { ok: false, error: 'Job nicht gefunden.' }
  if (job.status === 'video_fertig') return { ok: false, error: 'Job ist bereits fertig.' }

  await db
    .from('marketing_content_jobs')
    .update({ status: 'entwurf', fehler_text: null, aktualisiert_am: new Date().toISOString() })
    .eq('id', jobId)
  void generiereJobSkript(jobId, db).catch((e) => console.error('[marketing] regeneriereSkript failed', e))

  revalidatePath(detailPath(jobId))
  return { ok: true }
}

/** Startet einen haengengebliebenen/fehlgeschlagenen Job neu — routet nach Skript-Stand. */
export async function wiederholeJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const db = createAdminClient()
  const { data: job, error } = await db
    .from('marketing_content_jobs')
    .select('id, status, skript')
    .eq('id', jobId)
    .single()
  if (error || !job) return { ok: false, error: 'Job nicht gefunden.' }
  if (job.status === 'video_fertig') return { ok: false, error: 'Job ist bereits fertig.' }

  if (ContentScriptSchema.safeParse(job.skript).success) {
    // Skript vorhanden -> zurueck in die Render-Queue (Slice 3).
    await db
      .from('marketing_content_jobs')
      .update({ status: 'render_queued', fehler_text: null, aktualisiert_am: new Date().toISOString() })
      .eq('id', jobId)
    void verarbeiteRenderQueue(db).catch((e) => console.error('[marketing] wiederholeJob(render) failed', e))
  } else {
    // Kein Skript -> Skript-Phase wiederholen.
    await db
      .from('marketing_content_jobs')
      .update({ status: 'entwurf', fehler_text: null, aktualisiert_am: new Date().toISOString() })
      .eq('id', jobId)
    void generiereJobSkript(jobId, db).catch((e) => console.error('[marketing] wiederholeJob(skript) failed', e))
  }

  revalidatePath(LIST_PATH)
  revalidatePath(detailPath(jobId))
  return { ok: true }
}
