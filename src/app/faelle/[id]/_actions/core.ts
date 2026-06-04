'use server'

// AAR-684 Phase 2: Fall-Lifecycle — hard-delete, deactivate, reactivate.
// KFZ-120.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'
import { splitOrKeepFaelleUpdate } from '@/lib/faelle/claim-duplicate-columns'

export async function deleteFall(fallId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // REGEL 11: NIEMALS DELETE ohne WHERE! NIEMALS mit NULL!
    if (!fallId || typeof fallId !== 'string' || fallId.length < 10) {
      return { success: false, error: 'Ungültige Fall-ID' }
    }

    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return { success: false, error: 'Nicht angemeldet' }

    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    if (profile?.rolle !== 'admin') return { success: false, error: 'Nur Admins können Fälle löschen' }

    // CMM-49 PC-4: claim_id mitladen (SSoT). Der drop-safe 2-arg-RPC loescht Sub-Entities
    // (per fall_id, ueberlebt DROP TABLE faelle), die faelle-Zeile (solange Tabelle da)
    // UND den Claim. faelle.claim_id ist seit AAR-816 NOT NULL.
    const { data: fall, error: findErr } = await supabase.from('faelle').select('id, claim_id').eq('id', fallId).single()
    if (findErr || !fall) return { success: false, error: 'Fall nicht gefunden' }
    const claimId = (fall as { claim_id?: string | null }).claim_id ?? null

    // delete_fall_komplett ist SECURITY DEFINER und EXECUTE ist nur fuer service_role
    // (anon/authenticated revoked, #953 + CMM-49 PC-4) → admin-Client zwingend.
    const admin = createAdminClient()
    const { error: rpcErr } = await admin.rpc('delete_fall_komplett', { p_fall_id: fallId, p_claim_id: claimId })

    if (rpcErr) {
      console.error('[deleteFall] RPC error, nutze Fallback:', rpcErr.message)

      const tables = [
        'lead_historie', 'pflichtdokumente', 'qc_checkliste', 'forderungspositionen',
        'zahlungseingaenge', 'technische_probleme', 'gutachter_abrechnungspositionen',
        'gutachter_abrechnungen', 'gutachter_termine', 'gutachter_mitteilungen',
        'benachrichtigungen', 'timeline', 'tasks', 'nachrichten', 'fall_dokumente',
        'termine', 'flow_links',
      ]
      for (const table of tables) {
        try { await admin.from(table).delete().eq('fall_id', fallId) } catch { /* */ }
      }
      // faelle zuerst (faelle.claim_id ist ON DELETE RESTRICT), dann den Claim (SSoT).
      // faelle evtl. schon gedroppt (Phase G) → Fehler tolerieren.
      await admin.from('faelle').delete().eq('id', fallId)
      if (claimId) {
        const { error: claimDelErr } = await admin.from('claims').delete().eq('id', claimId)
        if (claimDelErr) return { success: false, error: claimDelErr.message }
      }
    }

    revalidatePath('/admin/faelle')
    return { success: true }
  } catch (err) {
    console.error('[deleteFall] Unerwarteter Fehler:', err)
    return { success: false, error: String(err) }
  }
}

export async function deactivateFall(
  fallId: string,
  grund: string,
  notiz: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const now = new Date().toISOString()
  // CMM-44 SP-B PR2a: ist_aktiv/deaktiviert_* leben jetzt auf claims (SSoT).
  // splitOrKeepFaelleUpdate routet sie auf claims; updated_at + faelle-only-Felder
  // bleiben auf faelle.
  const claimId = await resolveClaimId(supabase, fallId)
  const updateObj = {
    ist_aktiv: false, deaktiviert_am: now,
    deaktiviert_grund: grund, deaktiviert_notiz: notiz || null,
    updated_at: now,
  }
  const { faelleUpdate, claimsUpdate } = splitOrKeepFaelleUpdate(updateObj, claimId)
  await supabase.from('faelle').update(faelleUpdate).eq('id', fallId)
  if (claimId && Object.keys(claimsUpdate).length > 0) {
    // claims.ist_aktiv steuert die Admin-Hub-Sichtbarkeit — Fehler nicht
    // verschlucken, sonst entsteht eine faelle<->claims-Diskrepanz.
    const { error: claimErr } = await createAdminClient()
      .from('claims').update(claimsUpdate).eq('id', claimId)
    if (claimErr) console.error('[CMM-44 SP-B] claims-Update fehlgeschlagen:', claimErr.message)
  }

  await supabase.from('timeline').insert({
    fall_id: fallId, typ: 'system', titel: 'Fall deaktiviert',
    beschreibung: `Grund: ${grund}. ${notiz ? `Notiz: ${notiz}` : ''}`,
    erstellt_von: user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin/faelle')
  return { success: true }
}

export async function reactivateFall(
  fallId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const now = new Date().toISOString()
  // CMM-44 SP-B PR2a: ist_aktiv/deaktiviert_* leben jetzt auf claims (SSoT).
  const claimId = await resolveClaimId(supabase, fallId)
  const updateObj = {
    ist_aktiv: true, deaktiviert_am: null, deaktiviert_grund: null,
    deaktiviert_notiz: null, updated_at: now,
  }
  const { faelleUpdate, claimsUpdate } = splitOrKeepFaelleUpdate(updateObj, claimId)
  await supabase.from('faelle').update(faelleUpdate).eq('id', fallId)
  if (claimId && Object.keys(claimsUpdate).length > 0) {
    // claims.ist_aktiv steuert die Admin-Hub-Sichtbarkeit — Fehler nicht
    // verschlucken, sonst entsteht eine faelle<->claims-Diskrepanz.
    const { error: claimErr } = await createAdminClient()
      .from('claims').update(claimsUpdate).eq('id', claimId)
    if (claimErr) console.error('[CMM-44 SP-B] claims-Update fehlgeschlagen:', claimErr.message)
  }

  await supabase.from('timeline').insert({
    fall_id: fallId, typ: 'system', titel: 'Fall reaktiviert',
    beschreibung: 'Fall wurde reaktiviert.', erstellt_von: user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin/faelle')
  return { success: true }
}
