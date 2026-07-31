// WS E / Netzwerk-Bindung (P6 T10): der Karten-Issuer wird beim Scan zum netzwerk_owner
// des Claims (claims.netzwerk_owner_id, P0) — die Attribution speist den "Dein Netzwerk"-
// Finder-Boost (P2) und die Provisions-Suppression (P3).
// v1: Issuer = Flotte (schadenkarten.firma_id) -> firmen_flotten_konten.user_id (= profiles.id).
// Hook (nicht gebaut): generischer Issuer (SV/Werkstatt) fuer den Privatkunden-Rollout — sobald
// schadenkarten einen sv_id-/werkstatt_id-Issuer traegt, hier eine Typ-Weiche ergaenzen.

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export async function resolveNetzwerkOwnerFuerFlotte(db: AnyDb, firmaId: string): Promise<string | null> {
  const { data } = await db
    .from('firmen_flotten_konten')
    .select('user_id')
    .eq('firma_id', firmaId)
    .maybeSingle()
  return ((data as { user_id?: string | null } | null)?.user_id) ?? null
}
