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
    // CMM-49: claimId via resolveClaimId (== faelle.claim_id) statt faelle-Read; Existenz +
    // Access (user-RLS, bridge-RLS-Mirror) bleibt erhalten. p_fall_id bleibt der Param.
    const claimId = await resolveClaimId(supabase, fallId)
    if (!claimId) return { success: false, error: 'Fall nicht gefunden' }

    // delete_fall_komplett ist SECURITY DEFINER und EXECUTE ist nur fuer service_role
    // (anon/authenticated revoked, #953 + CMM-49 PC-4) → admin-Client zwingend.
    const admin = createAdminClient()
    const { error: rpcErr } = await admin.rpc('delete_fall_komplett', { p_fall_id: fallId, p_claim_id: claimId })

    if (rpcErr) {
      console.error('[deleteFall] RPC error, nutze Fallback:', rpcErr.message)

      const tables = [
        'lead_historie', 'pflichtdokumente', 'qc_checkliste', 'forderungspositionen',
        'zahlungseingaenge', 'technische_probleme', 'gutachter_abrechnungspositionen',
        'gutachter_termine', 'gutachter_mitteilungen',
        'benachrichtigungen', 'timeline', 'tasks', 'nachrichten', 'fall_dokumente',
        'termine', 'flow_links',
      ]
      for (const table of tables) {
        try { await admin.from(table).delete().eq('fall_id', fallId) } catch { /* */ }
      }
      // CMM-49 faelle-DROP: faelle ist gedroppt. Der Claim ist die SSoT; sein Delete raeumt
      // die faelle_claim_bridge via ON DELETE CASCADE (fk_bridge_claim) automatisch mit ab.
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

  // Write-Path-Audit (28.06.): Rollen-Guard — Fall-Deaktivierung (claims.ist_aktiv via
  // admin-client) ist eine Staff-Aktion (analog deleteFall oben).
  {
    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    if (!['admin', 'kundenbetreuer'].includes((profile?.rolle as string) ?? '')) {
      return { success: false, error: 'Nur Admin und Kundenbetreuer dürfen Fälle deaktivieren' }
    }
  }

  const now = new Date().toISOString()
  // CMM-44 SP-B PR2a: ist_aktiv/deaktiviert_* leben jetzt auf claims (SSoT).
  // CMM-49 (faelle-Drop): updateObj enthaelt nur CLAIM_OWNED-Spalten -> faelleUpdate
  // war immer nur {updated_at} (trigger-redundant via update_faelle_updated_at +
  // reader-frei) -> toter faelle-Spiegel-Write entfernt. Nur noch claimsUpdate.
  const claimId = await resolveClaimId(supabase, fallId)
  const updateObj = {
    ist_aktiv: false, deaktiviert_am: now,
    deaktiviert_grund: grund, deaktiviert_notiz: notiz || null,
  }
  const { claimsUpdate } = splitOrKeepFaelleUpdate(updateObj, claimId)
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

  // Write-Path-Audit (28.06.): Rollen-Guard — Reaktivierung (claims.ist_aktiv via admin-client).
  {
    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    if (!['admin', 'kundenbetreuer'].includes((profile?.rolle as string) ?? '')) {
      return { success: false, error: 'Nur Admin und Kundenbetreuer dürfen Fälle reaktivieren' }
    }
  }

  // CMM-44 SP-B PR2a: ist_aktiv/deaktiviert_* leben jetzt auf claims (SSoT).
  // CMM-49 (faelle-Drop): nur CLAIM_OWNED-Spalten -> toter {updated_at}-faelle-Spiegel-
  // Write entfernt (updated_at trigger-redundant + reader-frei). Nur noch claimsUpdate.
  const claimId = await resolveClaimId(supabase, fallId)
  const updateObj = {
    ist_aktiv: true, deaktiviert_am: null, deaktiviert_grund: null,
    deaktiviert_notiz: null,
  }
  const { claimsUpdate } = splitOrKeepFaelleUpdate(updateObj, claimId)
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
