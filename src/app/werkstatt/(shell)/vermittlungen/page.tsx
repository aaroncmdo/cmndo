// „Meine Vermittlungen" wurde in „Aufträge" vereint — die Auftragsansicht hat den
// Richtungs-Filter „Meine Vermittlungen" (inbound) / „Aufträge" (vermittelt). Diese
// Route redirectet dorthin, damit alte Bookmarks/Links weiter funktionieren.

import { redirect } from 'next/navigation'

export default function WerkstattVermittlungenRedirect() {
  redirect('/werkstatt/auftraege')
}
