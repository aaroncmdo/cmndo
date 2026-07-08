'use server'

// KVA-Loop (Kunde-Seite) — Kunde gibt den Werkstatt-Kostenvoranschlag frei.
// Setzt claims.reparatur_freigegeben_am + reparatur_freigegeben_von (analog zur
// Staff-Action reparaturFreigeben in src/app/faelle/[id]/_actions/reparatur-freigabe.ts,
// aber mit KUNDEN-Ownership statt requireStaff()).
//
// Auth/Ownership-Modell (wie schlageReparaturTerminVorPortal):
//   1. Kunde-Session (createClient) + getUser() — nicht angemeldet => Fehler.
//   2. Claim per Kunde-Session lesen: die claims-SELECT-RLS
//      (geschaedigter_user_id = auth.uid() ODER is_claim_user_party(id)) laesst
//      NUR eigene Claims durch => eine non-null Row IST der Ownership-Beweis.
//   3. UPDATE via Service-Client (kein Kunde-RLS-UPDATE auf claims vorhanden).

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function genehmigeKvaPortal(
  claimId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId) return { ok: false, error: 'Keine Fall-ID.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // Ownership-Gate: Kunde-Session-SELECT ist RLS-gated auf die eigenen Claims.
  // Eine gelesene Row => Kunde besitzt den Claim. reparatur_freigegeben_am wird
  // fuer Idempotenz mitgelesen.
  const { data: claim } = await supabase
    .from('claims')
    .select('id, reparatur_freigegeben_am')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Kein Zugriff auf diesen Fall.' }

  // Bereits freigegeben => idempotent ok (kein erneutes UPDATE, kein Ueberschreiben
  // des urspruenglichen Freigabe-Zeitpunkts).
  if ((claim as { reparatur_freigegeben_am: string | null }).reparatur_freigegeben_am) {
    return { ok: true }
  }

  // UPDATE via Service-Client (kein Kunde-RLS-UPDATE auf claims). Ownership ist
  // oben verifiziert; die .eq('id', claimId) haelt das UPDATE auf genau den Claim.
  const svc = createServiceClient()
  const { error } = await svc
    .from('claims')
    .update({
      reparatur_freigegeben_am: new Date().toISOString(),
      reparatur_freigegeben_von: user.id,
    })
    .eq('id', claimId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}
