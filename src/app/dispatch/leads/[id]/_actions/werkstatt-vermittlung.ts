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
  findQualifizierteReparaturWerkstaetten,
} from '@/lib/werkstatt/vermittlung-server'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import type { Qualifiziert } from '@/lib/werkstatt/bedarf/qualifiziere'
import type { VermittlungQuelle } from '@/lib/werkstatt/vermittlung-core'

export type VermittleWerkstattInput = {
  target: 'lead' | 'claim'
  id: string
  werkstattId: string
  /**
   * Ops-Test 12.08.: "Sicherungsabtretung liegt bereits vor" — der Sachverstaendige
   * hat sie offline eingeholt. Erfuellt die P4-Invariante ohne zweite digitale
   * Kunden-Unterschrift; wird auf dem Claim mit Zeitpunkt + Urheber protokolliert.
   */
  saLiegtBereitsVor?: boolean
}

export async function vermittleWerkstatt(
  input: VermittleWerkstattInput,
): Promise<{ ok: boolean; error?: string }> {
  // Write-Path-Haertung: dispatch/admin/kundenbetreuer duerfen vermitteln (in der
  // geteilten Fallakte auch KB "im Auftrag" — falls der Gutachter es nicht gemacht hat).
  const guard = await requireRole(['dispatch', 'admin', 'kundenbetreuer'])
  if (!guard.success) return { ok: false, error: guard.error }
  // quelle nach tatsaechlicher Rolle attribuieren (KB -> 'kb', sonst 'dispatcher').
  const quelle: VermittlungQuelle = guard.user.rolle === 'kundenbetreuer' ? 'kb' : 'dispatcher'

  const res = await assignReparaturWerkstatt({
    target: input.target,
    id: input.id,
    werkstattId: input.werkstattId,
    quelle,
    actorUserId: guard.user.id,
    saLiegtBereitsVor: input.saLiegtBereitsVor === true,
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
): Promise<
  | { ok: true; werkstaetten: Qualifiziert<WerkstattFinderRow>[]; keineSpezialisierte: boolean }
  | { ok: false; error: string }
> {
  // Read-Path-Haertung: gleiche Rollen wie die Mutation (dispatch/admin/kundenbetreuer).
  const guard = await requireRole(['dispatch', 'admin', 'kundenbetreuer'])
  if (!guard.success) return { ok: false, error: guard.error }
  const { werkstaetten, keineSpezialisierte } = await findQualifizierteReparaturWerkstaetten({
    target: input.target,
    id: input.id,
  })
  return { ok: true, werkstaetten, keineSpezialisierte }
}
