import { FlowShell } from '../_components/FlowShell'
import { Schritt1Client } from './Schritt1Client'

// AAR-468 C2: Schritt 1 Tippen-Modus — Server Shell + Client-Form.
// Die Promo-Cookie-Auflösung passiert erst serverseitig in der
// Server-Action beim Lead-Insert (create-lead.ts), nicht hier —
// der Client braucht den Code nicht direkt.

export default function Schritt1Page() {
  return (
    <FlowShell step={1}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-claimondo-navy">
            Was ist passiert?
          </h1>
          <p className="mt-2 text-claimondo-ondo">
            Erzähl uns kurz, was vorgefallen ist. Alle Angaben sind unverbindlich.
          </p>
        </div>
        <Schritt1Client />
      </div>
    </FlowShell>
  )
}
