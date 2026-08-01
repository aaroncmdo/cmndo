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
  // Paritaet mit deriveVermittler-Pfad (convert-lead-to-claim): nur AKTIVE Flotten-Konten;
  // limit(1) statt maybeSingle-auf-alles (Firmen mit >1 Konto duerfen nicht no-op'en) +
  // created_at-Determinismus (P3-Konvention: aeltestes Konto gewinnt).
  const { data } = await db
    .from('firmen_flotten_konten')
    .select('user_id')
    .eq('firma_id', firmaId)
    .eq('status', 'aktiv')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return ((data as { user_id?: string | null } | null)?.user_id) ?? null
}
