// Sub-Projekt 1 (Kunde-Portal 1+): Einstieg In-Portal-Schadenmeldung.
// Auth-Guard (Kunde); der Wizard-Client ruft die Server-Action, die Name/Kontakt
// serverseitig aus dem Profil vorbefuellt (keine Doppelabfrage bekannter Daten).

import { requirePortalAccess } from '@/lib/auth/portal-guard'
import SchadenMeldenWizard from './SchadenMeldenWizard'

export const dynamic = 'force-dynamic'

export default async function SchadenMeldenPage() {
  await requirePortalAccess(['kunde'])
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
      <h1 className="text-xl font-bold text-claimondo-navy">Neuen Schaden melden</h1>
      <p className="mt-1 mb-6 text-sm text-claimondo-shield">
        Ein paar Angaben genügen — wir kümmern uns um den Rest und melden uns bei Ihnen.
      </p>
      <SchadenMeldenWizard />
    </div>
  )
}
