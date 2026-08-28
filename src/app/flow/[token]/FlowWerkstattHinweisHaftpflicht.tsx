// Task 12 — Read-only Haftpflicht-Werkstatt-Hinweis im FlowLink.
// Haftpflicht (schuldfrage='gegner') erreicht den vollen Werkstatt-Step NIE
// (quali-flow-outcome.ts: reparaturwunsch=null bei gegner) — die Reparatur laeuft
// erst nach dem Gutachten. Diese Card setzt am SA-Step die Erwartung. Rein
// read-only, KEIN Write-Pfad (Skip/Weiter unveraendert). `werkstattName` optional:
// bei vorbelegter (QR-)Werkstatt personalisierbar (Follow-up; v1 uebergibt es nicht).

import { WrenchIcon } from 'lucide-react'

export function FlowWerkstattHinweisHaftpflicht({
  werkstattName,
}: {
  werkstattName?: string | null
}) {
  return (
    <div className="bg-claimondo-shield/5 border border-claimondo-shield/20 rounded-ios-md px-4 py-4 mb-5 flex gap-3">
      <WrenchIcon className="w-5 h-5 text-claimondo-ondo shrink-0 mt-0.5" />
      <div className="text-sm text-claimondo-navy leading-relaxed">
        <p className="font-medium mb-1">Reparatur nach dem Gutachten</p>
        {werkstattName ? (
          <p>
            Zuerst begutachtet Ihr Sachverständiger den Schaden. Danach übernimmt{' '}
            <strong>{werkstattName}</strong> die Reparatur — wir koordinieren alles für Sie.
          </p>
        ) : (
          <p>
            Zuerst begutachtet Ihr Sachverständiger den Schaden. Danach kümmern wir uns um die
            Reparatur — wir vermitteln Ihnen eine passende Werkstatt oder Sie nennen uns Ihre eigene.
          </p>
        )}
      </div>
    </div>
  )
}
