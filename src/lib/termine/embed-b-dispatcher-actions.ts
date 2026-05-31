'use server'

// AAR-939 — Team/Dispatcher-Aufloesung des embed-B Klaerungs-Tasks (schliesst den
// NEIN-Dead-End). Der Kunde-NEIN bzw. der Resolution-Cron erzeugt einen
// embed_b_termin_klaerung-Task; hier loest ihn das Team auf — entweder:
//   • SV-No-Show bestaetigen  → markSvNoShowEmbedB (Records-Signal, €70 bleibt)
//   • doch durchgefuehrt       → closeNurGutachterTerminAlsDurchgefuehrt (Claim terminal)
//
// KEINE Verlegung (separater Flow / dispatch-offene-anfragen-Strecke). Team-only.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'
import { markSvNoShowEmbedB } from '@/lib/termine/actions'
import { closeNurGutachterTerminAlsDurchgefuehrt } from '@/lib/termine/close-nur-gutachter-termin'
import { EMBED_B_KLAERUNG_TASK_TYP } from '@/lib/termine/embed-b-klaerung-task'

type AdminClient = ReturnType<typeof createAdminClient>

// Loest den offenen Klaerungs-Task fuer einen Termin (idempotent).
async function resolveKlaerungsTask(db: AdminClient, terminId: string, grund: string) {
  const now = new Date().toISOString()
  await db
    .from('tasks')
    .update({ status: 'erledigt', erledigt_am: now, auto_resolved_grund: grund })
    .eq('entity_type', 'termin')
    .eq('entity_id', terminId)
    .eq('task_typ', EMBED_B_KLAERUNG_TASK_TYP)
    .eq('status', 'offen')
}

function revalidate() {
  revalidatePath('/dispatch/dashboard')
  revalidatePath('/admin/tasks')
}

/**
 * Team bestaetigt: der SV ist NICHT erschienen. Setzt sv_no_show_am (via
 * markSvNoShowEmbedB — macht Auth + nur_gutachter-Guard) und schliesst den
 * Klaerungs-Task. €70 bleibt per Default faellig (SV zahlt). KEINE Verlegung.
 */
export async function bestaetigeSvNoShowVomTeam(
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await markSvNoShowEmbedB(terminId)
  if (!res.ok) return res
  const db = createAdminClient()
  await resolveKlaerungsTask(db, terminId, 'SV-No-Show vom Team bestätigt')
  revalidate()
  return { ok: true }
}

/**
 * Team bestaetigt: der Termin fand DOCH statt (z.B. nach Rueckfrage). Schliesst
 * den nur_gutachter-Claim terminal (geteilte Logik) und loest den Klaerungs-Task.
 */
export async function bestaetigeDurchgefuehrtVomTeam(
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin', 'dispatch'])
  if (!auth.success) return { ok: false, error: auth.error }

  const db = createAdminClient()
  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, fall_id, claim_id, durchgefuehrt_am')
    .eq('id', terminId)
    .single()
  if (!termin) return { ok: false, error: 'Termin nicht gefunden' }

  // Idempotent: bereits durchgefuehrt → nur Task aufraeumen.
  if (termin.durchgefuehrt_am) {
    await resolveKlaerungsTask(db, terminId, 'bereits durchgeführt')
    revalidate()
    return { ok: true }
  }

  // claim_id aufloesen + nur_gutachter-Guard (analog markSvNoShowEmbedB).
  let claimId = (termin.claim_id as string | null) ?? null
  if (!claimId && termin.fall_id) {
    const { data: fall } = await db.from('faelle').select('claim_id').eq('id', termin.fall_id).maybeSingle()
    claimId = (fall?.claim_id as string | null) ?? null
  }
  if (!claimId) return { ok: false, error: 'Kein Claim fuer diesen Termin' }
  const { data: claim } = await db.from('claims').select('service_typ').eq('id', claimId).maybeSingle()
  if ((claim?.service_typ as string | null) !== 'nur_gutachter') {
    return { ok: false, error: 'Aktion nur fuer nur_gutachter-Termine' }
  }

  const res = await closeNurGutachterTerminAlsDurchgefuehrt(db, {
    terminId,
    claimId,
    byUserId: auth.user.id,
    grund: 'Termin durchgeführt (vom Team bestätigt)',
  })
  if (!res.ok) return res

  await resolveKlaerungsTask(db, terminId, 'durchgeführt vom Team bestätigt')
  revalidate()
  return { ok: true }
}
