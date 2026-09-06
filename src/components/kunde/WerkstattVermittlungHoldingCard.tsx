// R3 (Repair-Audit): Holding-State fuer das „Vermittlungs-Blind-Window". Zwischen „Finder aus"
// (brauchtVermittlung=false — z.B. Dispatch/KB brokert bereits, reparatur_vermittlung_status!='offen',
// oder reparaturwunsch noch offen) und „Werkstatt zugewiesen" (reparatur_werkstatt_id gesetzt)
// rendert sonst KEINE Werkstatt-Karte — der Stepper zeigt „Werkstatt", darunter bleibt es leer
// (wirkt wie ein Stillstand). Diese Karte fuellt die Luecke mit einem beruhigenden Holding-State.
import { Card } from '@/components/primitives'
import { WrenchIcon } from 'lucide-react'

export default function WerkstattVermittlungHoldingCard() {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-ios-md bg-claimondo-bg">
          <WrenchIcon className="h-5 w-5 text-claimondo-ondo" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-claimondo-navy">Werkstatt wird vermittelt</h2>
          <p className="text-body-sm text-claimondo-ondo">
            Wir vermitteln gerade eine passende Werkstatt für Ihre Reparatur. Sobald sie feststeht,
            finden Sie hier die Details und können einen Reparaturtermin vereinbaren.
          </p>
        </div>
      </div>
    </Card>
  )
}
