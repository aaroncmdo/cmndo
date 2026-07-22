'use client'
// AAR-956 (Marker #1): Fokussierter SA-Signier-Screen fuer den EDGE-CASE eines EINGELOGGTEN
// Kunden mit bestehendem, aber UNSIGNIERTEM Fall (sa_unterschrieben=false auf einem SA-Weg).
//
// Bisher schickte der /flow/[token]-Redirect (page.tsx) solche Kunden nach
// /kunde/onboarding-details — das aber KEINE SA-Signatur enthaelt (Dead-End; der Portal-Task
// "Unterschrift ausstehend" ankerte ins Leere). Den vollen FlowWizardKfz zu zeigen ist falsch
// (Account-Step + weichen-Steps fuer einen bereits eingeloggten Kunden). Stattdessen rendern wir
// NUR den bestehenden SaSignaturStep. Nach dem Signieren geht es weiter ins Portal-Onboarding
// (die "Unterschrift ausstehend"-Aufgabe ist dann erledigt).
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'
import SaSignaturStep from './SaSignaturStep'

export default function FokusSignaturClient({
  token,
  leadId,
  flowLinkId,
  legalDocs,
  fallId,
}: {
  token: string
  leadId: string
  flowLinkId: string | null
  legalDocs: ComponentProps<typeof SaSignaturStep>['legalDocs']
  fallId: string
}) {
  const router = useRouter()
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <SaSignaturStep
        token={token}
        leadId={leadId}
        flowLinkId={flowLinkId}
        legalDocs={legalDocs}
        // Der Kunde ist bereits eingeloggt (Account existiert) -> kein Account-Step; nach der
        // Signatur direkt ins Portal-Onboarding, wo der Fall bereits sa_unterschrieben=true ist.
        onSigned={() => router.push(`/kunde/onboarding-details?fall_id=${fallId}`)}
      />
    </div>
  )
}
