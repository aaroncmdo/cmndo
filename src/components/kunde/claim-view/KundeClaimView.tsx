// P1 (Kunde-Detail-Rebuild): die Shell — rendert die sichtbaren Zonen in mobiler
// Reihenfolge (deriveKundeZonen, phasen-adaptiv). Jede Zone bekommt einen id-Anker,
// damit die AufgabenZone-CTAs dorthin springen. Mobile-first (schmale, zentrierte Spalte).
// team/geld/doksTermine folgen in P2/P3 — bis dahin liefern sie null (die Live-page.tsx
// wird erst in P3 atomar umgestellt, damit die Kunde-View nie leer läuft).

import { deriveKundeZonen } from '@/lib/claims/kunde-zonen'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'
import { StatusZone } from './StatusZone'
import { AufgabenZone } from './AufgabenZone'
import { TeamZone } from './TeamZone'
import { GeldZone } from './GeldZone'

export function KundeClaimView({ vm }: { vm: KundeClaimViewModel }) {
  const zonen = deriveKundeZonen(vm)

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {zonen.map((z) => {
        switch (z) {
          case 'status':
            return (
              <div id="zone-status" key={z}>
                <StatusZone vm={vm} />
              </div>
            )
          case 'aufgaben':
            return (
              <div id="zone-aufgaben" key={z}>
                <AufgabenZone vm={vm} />
              </div>
            )
          case 'team':
            return (
              <div id="zone-team" key={z}>
                <TeamZone vm={vm} />
              </div>
            )
          case 'geld':
            return (
              <div id="zone-geld" key={z}>
                <GeldZone vm={vm} />
              </div>
            )
          // doksTermine: P3
          default:
            return null
        }
      })}
    </div>
  )
}
