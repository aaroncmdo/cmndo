'use server'

// SP-C1 — Kunde-Portal Werkstatt-Finder-Actions. Der Kunde eines Reparatur-Claims
// OHNE hinterlegte Werkstatt laedt die naechsten Partner-Werkstaetten und waehlt eine.
// Ownership via Kunde-RLS (createClient): liest der Kunde den Claim, gehoert er ihm.
// Der Finder/Assign laeuft ueber den Admin-Client (vermittlung-server) — Authz liegt
// hier VOR dem Aufruf. Spiegelt das Muster aus reparatur-termin-actions.ts.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'

/** Ownership-Check via Kunde-RLS + "noch keine Werkstatt". */
async function assertOwnerOhneWerkstatt(
  claimId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  const { data: claim } = await supabase
    .from('claims')
    .select('id, reparatur_werkstatt_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Vorgang nicht gefunden.' }
  if ((claim as { reparatur_werkstatt_id: string | null }).reparatur_werkstatt_id) {
    return { ok: false, error: 'Es ist bereits eine Werkstatt hinterlegt.' }
  }
  return { ok: true, userId: user.id }
}

/** Die naechsten aktiven Partner-Werkstaetten zum Schadenort des Claims. */
export async function ladeWerkstaettenFuerClaim(
  claimId: string,
): Promise<{ ok: true; werkstaetten: WerkstattFinderRow[] } | { ok: false; error: string }> {
  if (!claimId) return { ok: false, error: 'Claim-ID fehlt.' }
  const owner = await assertOwnerOhneWerkstatt(claimId)
  if (!owner.ok) return { ok: false, error: owner.error }
  const { findReparaturWerkstaettenForTarget } = await import('@/lib/werkstatt/vermittlung-server')
  const werkstaetten = await findReparaturWerkstaettenForTarget({ target: 'claim', id: claimId })
  return { ok: true, werkstaetten }
}

/** Kunde waehlt eine Werkstatt fuer seinen Reparatur-Claim (quelle='kunde'). */
export async function waehleWerkstattPortal(
  claimId: string,
  werkstattId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId || !werkstattId) return { ok: false, error: 'Claim und Werkstatt sind erforderlich.' }
  const owner = await assertOwnerOhneWerkstatt(claimId)
  if (!owner.ok) return { ok: false, error: owner.error }

  // Anti-IDOR: nur eine aktive Partner-Werkstatt darf zugewiesen werden. Der Kunde kann
  // werkstaetten nicht per RLS lesen -> Service-Client fuer die reine Statuspruefung.
  const svc = createServiceClient()
  const { data: w } = await svc
    .from('werkstaetten')
    .select('id, status')
    .eq('id', werkstattId)
    .maybeSingle()
  if (!w || (w as { status: string | null }).status !== 'aktiv') {
    return { ok: false, error: 'Diese Werkstatt ist nicht verfügbar.' }
  }

  const { assignReparaturWerkstatt } = await import('@/lib/werkstatt/vermittlung-server')
  const res = await assignReparaturWerkstatt({
    target: 'claim',
    id: claimId,
    werkstattId,
    quelle: 'kunde',
    actorUserId: owner.userId,
  })
  if (!res.ok) return { ok: false, error: res.error }
  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}
