'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// KFZ-152 Phase 2+3 Follow-up: Server Actions fuer das /gutachter/team Tab.
//   - assignPoolLead: Verwalter ordnet einen Pool-Lead seiner Org einem
//     bestimmten Sub-SV zu (akademie_sub oder community_member).
//   - toggleSubSvSperre: Verwalter sperrt/entsperrt einen Mitarbeiter in
//     seiner Org (setzt gesperrt_seit Timestamp).

async function ensureVerwalter(): Promise<{ ok: true; userId: string; svId: string; orgId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const adminDb = createAdminClient()
  const { data: sv } = await adminDb.from('sachverstaendige')
    .select('id, organisation_id, rolle_in_organisation, ist_parent_account')
    .eq('profile_id', user.id)
    .order('ist_parent_account', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!sv?.organisation_id) return { ok: false, error: 'Du gehoerst keiner Organisation' }
  if (!sv.ist_parent_account && sv.rolle_in_organisation !== 'inhaber') {
    return { ok: false, error: 'Nur Inhaber/Verwalter haben diese Berechtigung' }
  }
  return { ok: true, userId: user.id, svId: sv.id, orgId: sv.organisation_id }
}

/**
 * KFZ-152: Verwalter weist einen Pool-Lead einem konkreten Sub-SV zu.
 * Pool-Leads sind faelle.organisation_id=org AND faelle.sv_id=null.
 * Pruefung: der Ziel-Sub-SV muss zur SELBEN Org gehoeren wie der Verwalter.
 */
export async function assignPoolLead(fall_id: string, target_sv_id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await ensureVerwalter()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()

  // Fall laden + verifizieren dass er im Pool dieser Org ist
  const { data: fall } = await db.from('faelle')
    .select('id, organisation_id, sv_id')
    .eq('id', fall_id)
    .maybeSingle()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }
  if (fall.organisation_id !== auth.orgId) return { success: false, error: 'Fall gehoert nicht zu deiner Organisation' }
  if (fall.sv_id) return { success: false, error: 'Fall ist bereits einem SV zugewiesen' }

  // Ziel-SV verifizieren
  const { data: targetSv } = await db.from('sachverstaendige')
    .select('id, organisation_id, paket_faelle_gesamt, paket_faelle_genutzt')
    .eq('id', target_sv_id)
    .maybeSingle()
  if (!targetSv) return { success: false, error: 'Ziel-SV nicht gefunden' }
  if (targetSv.organisation_id !== auth.orgId) return { success: false, error: 'Ziel-SV gehoert nicht zu deiner Organisation' }
  if ((targetSv.paket_faelle_genutzt ?? 0) >= (targetSv.paket_faelle_gesamt ?? 0)) {
    return { success: false, error: 'Ziel-SV hat sein Monats-Kontingent erreicht' }
  }

  // Zuweisen
  const now = new Date().toISOString()
  const { error: updErr } = await db.from('faelle').update({
    sv_id: target_sv_id,
    sv_zugewiesen_am: now,
    status: 'sv-zugewiesen',
  }).eq('id', fall_id)
  if (updErr) return { success: false, error: `Zuweisung fehlgeschlagen: ${updErr.message}` }

  // Counter erhoehen
  await db.from('sachverstaendige').update({
    paket_faelle_genutzt: (targetSv.paket_faelle_genutzt ?? 0) + 1,
  }).eq('id', target_sv_id)

  revalidatePath('/gutachter/team', 'page')
  revalidatePath('/admin/dispatch', 'page')
  return { success: true }
}

/**
 * KFZ-152 Follow-up: Verwalter sperrt/entsperrt einen Sub-SV in seiner Org.
 * Setzt sachverstaendige.gesperrt_seit (NULL = entsperrt).
 */
export async function toggleSubSvSperre(target_sv_id: string, sperren: boolean): Promise<{ success: boolean; error?: string }> {
  const auth = await ensureVerwalter()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()

  const { data: targetSv } = await db.from('sachverstaendige')
    .select('id, organisation_id, ist_parent_account')
    .eq('id', target_sv_id)
    .maybeSingle()
  if (!targetSv) return { success: false, error: 'Ziel-SV nicht gefunden' }
  if (targetSv.organisation_id !== auth.orgId) return { success: false, error: 'Ziel-SV gehoert nicht zu deiner Organisation' }
  if (targetSv.ist_parent_account) return { success: false, error: 'Verwalter selbst kann nicht gesperrt werden' }
  if (target_sv_id === auth.svId) return { success: false, error: 'Du kannst dich nicht selbst sperren' }

  const { error: updErr } = await db.from('sachverstaendige').update({
    gesperrt_seit: sperren ? new Date().toISOString() : null,
    gesperrt_grund: sperren ? 'Vom Verwalter gesperrt' : null,
  }).eq('id', target_sv_id)
  if (updErr) return { success: false, error: `Sperre fehlgeschlagen: ${updErr.message}` }

  revalidatePath('/gutachter/team', 'page')
  return { success: true }
}
