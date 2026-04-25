import { FlowShell } from '../_components/FlowShell'
import { Schritt1Client } from './Schritt1Client'
import PageHeader from '@/components/shared/PageHeader'

// AAR-468 C2: Schritt 1 Tippen-Modus — Server Shell + Client-Form.
// Die Promo-Cookie-Auflösung passiert erst serverseitig in der
// Server-Action beim Lead-Insert (create-lead.ts), nicht hier —
// der Client braucht den Code nicht direkt.

export default function Schritt1Page() {
  return (
    <FlowShell step={1}>
      <div className="space-y-6">
        <PageHeader
          title="Was ist passiert?"
          description="Erzähl uns kurz, was vorgefallen ist. Alle Angaben sind unverbindlich."
          size="lg"
        />
        <Schritt1Client />
      </div>
    </FlowShell>
  )
}
