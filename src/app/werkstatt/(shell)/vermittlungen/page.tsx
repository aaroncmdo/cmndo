// „Meine Vermittlungen" wurde in „Aufträge" vereint — die Auftragsansicht hat den
// Richtungs-Filter „Meine Vermittlungen" (inbound) / „Aufträge" (vermittelt). Diese
// Route redirectet dorthin, damit alte Bookmarks/Links weiter funktionieren.

import { redirect } from 'next/navigation'

// Ohne force-dynamic wird diese redirect-only Seite static-optimiert -> redirect() feuert
// zur Build-Zeit nicht als 307; prod rendert stattdessen eine leere Shell (Prod-Smoke 06.07.:
// HTTP 200, kein <h1>, kein Redirect). Dynamik erzwingen, damit redirect() pro Request laeuft.
export const dynamic = 'force-dynamic'

export default function WerkstattVermittlungenRedirect() {
  redirect('/werkstatt/auftraege')
}
