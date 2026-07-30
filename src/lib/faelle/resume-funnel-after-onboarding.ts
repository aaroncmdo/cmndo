// P4 (Netzwerk SV-Vermittlungs-Flow): der Sofort-Claim wird un-onboardet in 'gutachten-eingegangen'
// geboren (Direkt-INSERT, umgeht die State-Machine). Billing/SLA/QC sind daher AUFGESCHOBEN. Sobald
// der Kunde bestaetigt hat (SA signiert -> completeOnboarding bzw. sign-into-existing), holt dieser
// Hook sie nach: processCaseBilling (SA-Gate greift jetzt) + checkFallAutoPhase (gutachten-eingegangen
// -> filmcheck, kundeBestaetigt=true). Fuer Normalfall-Claims No-op (Billing idempotent via
// lead_preis_netto-Guard; AutoPhase findet keinen offenen Vorwaerts-Hop). NON-FATAL: darf den
// Onboarding-Abschluss nie brechen.
import { checkFallAutoPhase } from '@/lib/autoPhase'
import { processCaseBilling } from '@/lib/abrechnung/process-case-billing'

export async function resumeFunnelAfterOnboarding(fallId: string): Promise<void> {
  try {
    await processCaseBilling(fallId) // idempotent (lead_preis_netto-Guard); SA-Gate greift jetzt
  } catch (err) {
    console.error('[resumeFunnelAfterOnboarding] processCaseBilling non-fatal:', err)
  }
  try {
    await checkFallAutoPhase(fallId) // gutachten-eingegangen -> filmcheck (jetzt kundeBestaetigt)
  } catch (err) {
    console.error('[resumeFunnelAfterOnboarding] checkFallAutoPhase non-fatal:', err)
  }
}
