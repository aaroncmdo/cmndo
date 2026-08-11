'use server'

// AAR-956 P4-A: token-basierter Self-Service-Save der deklarativen Feststellungs-Felder auf den Lead.
// CMM-49 Onboarding-Writer-Kanonisierung: nur noch ein duenner Wrapper -> baut den Schreib-Kontext
// (audience='flow', Token-resolved leadId, admin-Client) und delegiert an saveOnboardingFields. Der
// leads-Handler uebernimmt SA-Lockdown + Coercion + Write. Felder/Allowlist serverseitig aus
// onboarding_felder (NIE Client-Mapping vertrauen).

import { revalidatePath } from 'next/cache'
import { ladeLeadErfassungLeadsFelder } from '@/lib/onboarding/lead-erfassung-allowlist'
import { saveOnboardingFields } from '@/lib/onboarding/save-onboarding-fields'
import { resolveFlowLeadId } from '@/lib/flow/flow-token'
import type { OnboardingFeld } from '@/components/onboarding/types'
import type { OnboardingWriteContext } from '@/lib/onboarding/write-context'

export async function speichereFeststellungFlow(
  token: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLeadId(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // Felder serverseitig aus onboarding_felder -> als felder fuer den Router synthetisieren
  // (db_target.tabelle='leads', typ aus der Config; zb1-upload ist im Loader bereits ausgelassen).
  const feldMap = await ladeLeadErfassungLeadsFelder()
  const felder: OnboardingFeld[] = [...feldMap].map(([feld_key, meta]) => ({
    id: feld_key,
    phase_id: '',
    reihenfolge: 0,
    feld_key,
    typ: meta.typ as OnboardingFeld['typ'],
    label: '',
    pflicht: false,
    db_target: { tabelle: 'leads', spalte: meta.spalte },
  }))

  const ctx: OnboardingWriteContext = {
    supabase: admin as unknown as OnboardingWriteContext['supabase'],
    user: null,
    audience: 'flow',
    leadId,
  }
  const r = await saveOnboardingFields(ctx, felder, values)
  if (!r.ok) return { ok: false, error: r.error }
  revalidatePath('/dispatch/leads')
  return { ok: true }
}
