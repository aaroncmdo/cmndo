// P4 (Netzwerk SV-Vermittlungs-Flow): "sign-into-existing-claim". Der SV-Sofort-Claim existiert
// bereits (vermittlePartnerWerkstatt, P4 T7) -> die Kunden-SA muss ihn UPDATEN, nicht neu
// konvertieren (convertLeadToClaim ist idempotent und verwuerfe die signatureUrl still, K5).
// Setzt sa_unterschrieben/abtretung_pdf + onboarding_complete=true (Spec 3 §4) und loest die
// aufgeschobenen Funnel-Effekte aus. Schreibt bewusst KEIN operative_status (bleibt
// 'gutachten-eingegangen'; AutoPhase advanced es im resume-Hook). Resume non-fatal.
import type { createAdminClient } from '@/lib/supabase/admin'

export async function applySAToExistingClaim(
  admin: ReturnType<typeof createAdminClient>,
  input: { claimId: string; fallId: string; signatureUrl: string },
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString()
  const { error } = await admin
    .from('claims')
    .update({
      sa_unterschrieben: true,
      sa_unterschrieben_am: now,
      abtretung_signiert_am: now,
      abtretung_pdf: input.signatureUrl,
      onboarding_complete: true,
    } as never)
    .eq('id', input.claimId)
  if (error) return { ok: false, error: error.message }
  try {
    const { resumeFunnelAfterOnboarding } = await import('@/lib/faelle/resume-funnel-after-onboarding')
    await resumeFunnelAfterOnboarding(input.fallId)
  } catch (err) {
    console.error('[applySAToExistingClaim] resume non-fatal:', err)
  }
  return { ok: true }
}
