// Task 12 — Read-only Haftpflicht-Werkstatt-Hinweis im FlowLink.
// Bei Haftpflicht (schuldfrage='gegner') setzt quali-flow-outcome.ts `reparaturwunsch=null`:
// die Reparatur laeuft erst nach dem Gutachten. Diese Card setzt am SA-Step die Erwartung.
// Rein read-only, KEIN Write-Pfad (Skip/Weiter unveraendert). `werkstattName` optional:
// bei vorbelegter (QR-)Werkstatt personalisierbar (Follow-up; v1 uebergibt es nicht).
//
// ⚠ Der frueher hier stehende Satz „erreicht den vollen Werkstatt-Step NIE" vermischte zwei
// Dinge: den Werkstatt-STEP (steht sehr wohl in der Haftpflicht-Sequenz von
// flow_szenario_steps, Reihenfolge 7 — er faellt nur weg, wenn bereits ein Gutachten
// vermittelt ist) und den reparaturwunsch-WERT (den setzt die Quali bei Haftpflicht
// tatsaechlich nicht). Nur Letzteres stimmt.
//
// Seit 30.08. (Aaron) wird die Auszahlungsart direkt UNTER dieser Card erhoben — deshalb
// nimmt der Text die Wahl nicht mehr vorweg („Danach kuemmern wir uns um die Reparatur"
// stand woertlich ueber einer Auswahl, die auch „fiktiv" anbietet).

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
        <p className="font-medium mb-1">Das Gutachten kommt zuerst</p>
        {werkstattName ? (
          <p>
            Zuerst begutachtet Ihr Sachverständiger den Schaden. Entscheiden Sie sich danach für
            eine Reparatur, übernimmt <strong>{werkstattName}</strong> — wir koordinieren alles
            für Sie.
          </p>
        ) : (
          <p>
            Zuerst begutachtet dein Sachverständiger den Schaden. Entscheidest du dich danach für
            eine Reparatur, vermitteln wir dir eine passende Werkstatt — oder du nennst uns deine
            eigene.
          </p>
        )}
      </div>
    </div>
  )
}
