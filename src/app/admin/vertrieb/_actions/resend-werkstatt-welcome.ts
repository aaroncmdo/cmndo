'use server'
// Vertrieb-CRM P5: Admin sendet einer bestehenden Werkstatt die Login-/Willkommens-Mail
// erneut (analog resendMaklerWelcome). Zweck der Aktion = der Versand -> Fehler als Result.
// Hinweis: sendWillkommenWerkstatt hat (noch) keine allowInternalRecipient-Option -> interne/
// Test-Werkstaetten wuerden von der Send-Isolation gefiltert (Parity-Follow-up); fuer echte
// (externe) Werkstaetten unerheblich.
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWillkommenWerkstatt } from '@/lib/email/google/flows'
import { revalidatePath } from 'next/cache'

export async function resendWerkstattWelcome(
  werkstattId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Nur Admins dürfen Login-Mails senden.' }

  const admin = createAdminClient()
  const { data: w } = await admin.from('werkstaetten').select('name, email').eq('id', werkstattId).maybeSingle()
  if (!w || !w.email) {
    return { ok: false, error: 'Werkstatt nicht gefunden oder ohne E-Mail-Adresse.' }
  }

  try {
    await sendWillkommenWerkstatt({ to: w.email, werkstattName: (w.name as string | null) ?? '' })
  } catch (err) {
    console.error('[resendWerkstattWelcome] Login-Mail fehlgeschlagen:', err)
    return { ok: false, error: 'Die Login-Mail konnte nicht gesendet werden.' }
  }

  revalidatePath('/admin/vertrieb')
  return { ok: true }
}
