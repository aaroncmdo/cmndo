'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type AssignResult =
  | { ok: true; phase: string }
  | { ok: false; error: string }

/**
 * Weist einem Claim einen Kundenbetreuer zu (Pool-Übernahme oder Admin-Zuweisung).
 *
 * Phase-Trigger feuert automatisch nach dem UPDATE:
 *   kundenbetreuer_id IS NOT NULL → claims.phase = '2_in_bearbeitung'
 *
 * Aufruf:
 *   - KB im Pool-Dashboard: assignKundenbetreuer(claimId) — ohne kb_id (= auth.uid())
 *   - Admin: assignKundenbetreuer(claimId, kbId) — mit expliziter kb_id
 */
export async function assignKundenbetreuer(
  claimId: string,
  kbId?: string,
): Promise<AssignResult> {
  const db = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht authentifiziert.' }

  const { data: profil } = await admin
    .from('profiles')
    .select('id, rolle')
    .eq('id', user.id)
    .single()
  if (!profil) return { ok: false, error: 'Profil nicht gefunden.' }

  const zielKbId = kbId ?? user.id

  // Rollen-Prüfung
  const rolle = profil.rolle as string
  if (rolle === 'kundenbetreuer' && zielKbId !== user.id) {
    return { ok: false, error: 'Kundenbetreuer können nur sich selbst zuweisen.' }
  }
  if (rolle !== 'kundenbetreuer' && rolle !== 'admin') {
    return { ok: false, error: 'Keine Berechtigung zur KB-Zuweisung.' }
  }

  // Claim laden + prüfen
  const { data: claim, error: loadErr } = await admin
    .from('claims')
    .select('id, kundenbetreuer_id, status, claim_nummer')
    .eq('id', claimId)
    .single()

  if (loadErr || !claim) return { ok: false, error: 'Claim nicht gefunden.' }
  if (claim.kundenbetreuer_id && rolle === 'kundenbetreuer') {
    return {
      ok: false,
      error: `Claim ${claim.claim_nummer} ist bereits einem Kundenbetreuer zugewiesen.`,
    }
  }

  // Ziel-KB validieren
  const { data: zielKb } = await admin
    .from('profiles')
    .select('id, rolle')
    .eq('id', zielKbId)
    .single()
  if (!zielKb || zielKb.rolle !== 'kundenbetreuer') {
    return { ok: false, error: 'Ziel-User ist kein Kundenbetreuer.' }
  }

  // Zuweisung schreiben — Phase-Trigger setzt phase='2_in_bearbeitung' automatisch
  const { data: updated, error: updateErr } = await admin
    .from('claims')
    .update({ kundenbetreuer_id: zielKbId })
    .eq('id', claimId)
    .select('phase')
    .single()

  if (updateErr || !updated) {
    return { ok: false, error: `Zuweisung fehlgeschlagen: ${updateErr?.message ?? 'Unbekannt'}` }
  }

  revalidatePath('/kb/claims')
  revalidatePath('/kb/pool')
  revalidatePath(`/kb/claims/${claimId}`)
  revalidatePath('/admin/faelle')

  return { ok: true, phase: updated.phase as string }
}
