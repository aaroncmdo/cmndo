// P4 (Netzwerk SV-Vermittlungs-Flow): "sign-into-existing-claim". Der SV-Sofort-Claim existiert
// bereits (vermittlePartnerWerkstatt, P4 T7) -> die Kunden-SA muss ihn UPDATEN, nicht neu
// konvertieren (convertLeadToClaim ist idempotent und verwuerfe die signatureUrl still, K5).
// Setzt sa_unterschrieben/abtretung_pdf + onboarding_complete=true (Spec 3 §4) und loest die
// aufgeschobenen Funnel-Effekte aus. Schreibt bewusst KEIN operative_status (bleibt
// 'gutachten-eingegangen'; AutoPhase advanced es im resume-Hook). Resume non-fatal.
import type { createAdminClient } from '@/lib/supabase/admin'
import { leiteServiceUebernahmeAb } from './service-wahl-uebernahme'

export async function applySAToExistingClaim(
  admin: ReturnType<typeof createAdminClient>,
  input: { claimId: string; fallId: string; signatureUrl: string },
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString()

  // P4-Smoke-Befund 31.07. (PR #4897-Kommentar): Der Sofort-Claim wird mit den Anlage-Defaults
  // (komplett/partnerkanzlei) geboren; die Service-Wahl des Kunden aus dem SA-Step landet nur am
  // LEAD (Autosave). Ohne Uebernahme laeuft ein "Nur Gutachten"-Vermittlungskunde in die
  // partnerkanzlei-/LexDrive-Pipeline (Mandats-Push nach Filmcheck) — Soll (Aaron 29.07.):
  // nur_gutachter = KEIN juristischer Ansprechpartner. Ableitung = Paritaet zu convertLeadToClaim.
  // Fail-soft: scheitert der Lead-Read, bleibt das bisherige Verhalten (SA-Signatur ist wichtiger
  // als die Wahl-Uebernahme; der Claim behaelt dann die Defaults).
  let serviceUebernahme: { service_typ: string; kanzlei_wunsch: string } | null = null
  try {
    const { data: claimRow } = await admin
      .from('claims')
      .select('lead_id')
      .eq('id', input.claimId)
      .maybeSingle()
    const leadId = (claimRow as { lead_id?: string | null } | null)?.lead_id ?? null
    if (leadId) {
      const { data: leadRow } = await admin
        .from('leads')
        .select('service_typ')
        .eq('id', leadId)
        .maybeSingle()
      serviceUebernahme = leiteServiceUebernahmeAb(
        (leadRow as { service_typ?: string | null } | null)?.service_typ ?? null,
      )
    }
  } catch (err) {
    console.error('[applySAToExistingClaim] service-Uebernahme non-fatal:', err)
  }

  const { error } = await admin
    .from('claims')
    .update({
      sa_unterschrieben: true,
      sa_unterschrieben_am: now,
      abtretung_signiert_am: now,
      abtretung_pdf: input.signatureUrl,
      onboarding_complete: true,
      ...(serviceUebernahme ?? {}),
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
