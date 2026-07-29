import type { SupabaseClient } from '@supabase/supabase-js'

export type Zielrolle = 'werkstatt' | 'gutachter'

export const ZIELROLLE_TO_ENTITY: Record<Zielrolle, { tabelle: string; profilSpalte: string }> = {
  werkstatt: { tabelle: 'werkstaetten', profilSpalte: 'user_id' },
  gutachter: { tabelle: 'sachverstaendige', profilSpalte: 'profile_id' },
}

/**
 * Batch (K10): die Entity-Ids der befreundeten Partner des Owners im Kandidaten-id-Raum.
 * Zwei Reads (Freund-Profile via Definer-View, dann Entity-Aufloesung) — nie per-Kandidat.
 * admin = service-role (v_netzwerk_freunde ist service_role-only).
 */
export async function ladeFreundKandidatIds(
  admin: SupabaseClient,
  ownerProfilId: string,
  zielRolle: Zielrolle,
): Promise<Set<string>> {
  const { data: freunde, error: e1 } = await admin
    .from('v_netzwerk_freunde')
    .select('freund_id')
    .eq('profil_id', ownerProfilId)
  if (e1) {
    console.error('[ladeFreundKandidatIds] freunde', e1.message)
    return new Set()
  }
  const freundProfile = (freunde ?? []).map((r: { freund_id: string }) => r.freund_id)
  if (freundProfile.length === 0) return new Set()

  const { tabelle, profilSpalte } = ZIELROLLE_TO_ENTITY[zielRolle]
  const { data: entities, error: e2 } = await admin
    .from(tabelle)
    .select('id')
    .in(profilSpalte, freundProfile)
  if (e2) {
    console.error('[ladeFreundKandidatIds] entities', e2.message)
    return new Set()
  }
  return new Set((entities ?? []).map((r: { id: string }) => r.id))
}
