'use server'

// AAR Werkstatt-Vermittlung: Dispatcher/Admin weist einem Lead ODER Claim eine
// Reparatur-Werkstatt zu. Die eigentliche Logik (Write + Kunde-/Werkstatt-Notify)
// liegt im geteilten Kern (vermittlung-server.ts), damit Gutachter/KB/Kunde-Flow
// denselben Pfad nutzen (quelle unterscheidet die Herkunft). Hier bleibt nur der
// dispatch/admin-Guard + surface-spezifisches revalidatePath.

import { requireRole } from '@/lib/auth/guards'
import { revalidatePath } from 'next/cache'
import {
  assignReparaturWerkstatt,
  findReparaturWerkstaettenForTarget,
} from '@/lib/werkstatt/vermittlung-server'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'

export type VermittleWerkstattInput = {
  target: 'lead' | 'claim'
  id: string
  werkstattId: string
}

export async function vermittleWerkstatt(
  input: VermittleWerkstattInput,
): Promise<{ ok: boolean; error?: string }> {
  // Write-Path-Haertung: nur dispatch/admin duerfen vermitteln.
  const guard = await requireRole(['dispatch', 'admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const res = await assignReparaturWerkstatt({
    target: input.target,
    id: input.id,
    werkstattId: input.werkstattId,
    quelle: 'dispatcher',
    actorUserId: guard.user.id,
  })
  if (!res.ok) return res

  if (input.target === 'lead') {
    revalidatePath(`/dispatch/leads/${input.id}`)
    revalidatePath('/dispatch/leads')
  } else {
    // Geteilte Fallakte (admin/dispatch/kb/kanzlei).
    revalidatePath(`/faelle/${input.id}`)
  }
  return { ok: true }
}

export type GetWerkstaettenNahInput = {
  target: 'lead' | 'claim'
  id: string
}

export async function getWerkstaettenNah(
  input: GetWerkstaettenNahInput,
): Promise<{ ok: true; werkstaetten: WerkstattFinderRow[] } | { ok: false; error: string }> {
  // Read-Path-Haertung: gleiche Rollen wie die Mutation (dispatch/admin).
  const guard = await requireRole(['dispatch', 'admin'])
  if (!guard.success) return { ok: false, error: guard.error }
  const werkstaetten = await findReparaturWerkstaettenForTarget({ target: input.target, id: input.id })
  return { ok: true, werkstaetten }
}
