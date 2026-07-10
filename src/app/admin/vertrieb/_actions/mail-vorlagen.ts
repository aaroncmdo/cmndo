'use server'
// Vertrieb-CRM P3: DB-Vorlagen laden + Master editieren (vollstaendig DB-driven, D5).
// Staff-gegatet; Admin-Client nur nach Guard.
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { MailVorlage, VorlageTyp } from '../_lib/mail-vorlagen'

export async function getVertriebMailVorlagen(): Promise<
  { ok: true; data: MailVorlage[] } | { ok: false; error: string }
> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vertrieb_mail_vorlagen')
    .select('typ, betreff, body')
    .eq('aktiv', true)
  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    data: (data ?? []).map((r) => ({ typ: r.typ as VorlageTyp, betreff: r.betreff, body: r.body })),
  }
}

export async function updateMailVorlage(
  typ: VorlageTyp,
  patch: { betreff: string; body: string },
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  if (!patch.betreff.trim() || !patch.body.trim()) {
    return { ok: false, error: 'Betreff und Text dürfen nicht leer sein.' }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from('vertrieb_mail_vorlagen')
    .update({ betreff: patch.betreff, body: patch.body, aktualisiert_am: new Date().toISOString() })
    .eq('typ', typ)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/vertrieb/vorlagen')
  return { ok: true }
}
