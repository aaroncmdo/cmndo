// P1 (Kunde-Detail-Rebuild): AufgabenZone — offene Kunde-To-dos als CTA-Zeilen.
// Blendet sich aus, wenn nichts offen ist (deriveKundeAufgaben leer). Jede Aufgabe
// verlinkt per Anchor auf die zuständige Zone (die Shell setzt die id-Anker).

import { Card } from '@/components/primitives'
import { ChevronRightIcon } from 'lucide-react'
import { deriveKundeAufgaben, type KundeAufgabe } from '@/lib/claims/kunde-zonen'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'

const AUFGABE_ANCHOR: Record<KundeAufgabe['id'], string> = {
  bankdaten: '#zone-geld',
  kva_freigabe: '#zone-geld',
  pflichtdok: '#zone-doksTermine',
  termin_bestaetigen: '#zone-doksTermine',
  sa_vollmacht: '#zone-status',
}

export function AufgabenZone({ vm }: { vm: KundeClaimViewModel }) {
  const aufgaben = deriveKundeAufgaben(vm)
  if (aufgaben.length === 0) return null

  return (
    <Card p={4} className="space-y-2">
      <h2 className="text-body-sm font-semibold text-claimondo-navy">Deine Aufgaben</h2>
      <ul className="space-y-1.5">
        {aufgaben.map((a) => (
          <li key={a.id}>
            <a
              href={a.zone ? `#zone-${a.zone}` : AUFGABE_ANCHOR[a.id]}
              className="flex items-center justify-between gap-2 rounded-ios-sm bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy hover:bg-claimondo-border/40 transition-colors"
            >
              <span>{a.label}</span>
              <ChevronRightIcon className="w-4 h-4 text-claimondo-ondo shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </Card>
  )
}
