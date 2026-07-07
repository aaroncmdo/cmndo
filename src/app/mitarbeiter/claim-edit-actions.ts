'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { ALLOWED_CLAIM_FIELDS, type AllowedField } from './claim-edit-fields'

export async function updateClaimField(
  claimId: string,
  field: string,
  value: string | number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(ALLOWED_CLAIM_FIELDS as readonly string[]).includes(field)) {
    return { ok: false, error: 'Feld nicht editierbar' }
  }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  const rolle = (profile?.rolle as string | null) ?? null
  const { data: claim, error: readErr } = await admin.from('claims').select('kundenbetreuer_id').eq('id', claimId).maybeSingle()
  if (readErr || !claim) return { ok: false, error: 'Fall nicht gefunden' }
  const isAdmin = rolle === 'admin'
  const isOwner = claim.kundenbetreuer_id === user.id
  if (!isAdmin && !isOwner) return { ok: false, error: 'Keine Berechtigung' }

  // Note: `old` value is null here (ownership select only fetched kundenbetreuer_id).
  // Decision: keep old:null for Phase 1b (audit captures field+new value; old=null is acceptable).
  // See report: docs/.superpowers/sdd/task-phase1b-report.md
  const oldVal = null

  const { error: upErr } = await admin.from('claims').update({ [field as AllowedField]: value }).eq('id', claimId)
  if (upErr) return { ok: false, error: upErr.message }

  // Audit — non-critical (must not fail the write).
  try {
    await admin.from('timeline').insert({
      claim_id: claimId, typ: 'kb_edit', titel: `Feld bearbeitet: ${field}`,
      erstellt_von: user.id, metadata: { field, old: oldVal, new: value },
    })
  } catch (err) { console.error('[updateClaimField] audit insert failed', err) }

  revalidatePath('/mitarbeiter')
  return { ok: true }
}
