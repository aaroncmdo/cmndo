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
  termin_waehlen: '#zone-doksTermine', // Fallback — hrefFor routet auf die Kalender-Route (T4)
  termin_bestaetigen: '#zone-doksTermine',
  sa_vollmacht: '#zone-status',
}

export function AufgabenZone({ vm }: { vm: KundeClaimViewModel }) {
  const aufgaben = deriveKundeAufgaben(vm)
  if (aufgaben.length === 0) return null

  // sa_vollmacht: SA/Vollmacht wird nur im /flow/[token]-Flow (FokusSignaturClient) signiert — der
  // Anchor #zone-status war eine Sackgasse (StatusZone rendert kein Signier-UI). Der Resolver
  // /kunde/faelle/[id]/unterschrift holt den FlowLink und leitet zum Nachsignieren.
  // T4: termin_waehlen führt in den Akte-Kalender (Wunschtermin-Fallback / SV-Slots), analog
  // zum sa_vollmacht-Route-Resolver — beide sind echte Routen, kein In-Page-Anchor.
  const hrefFor = (a: KundeAufgabe): string =>
    a.id === 'sa_vollmacht'
      ? `/kunde/faelle/${vm.claimId}/unterschrift`
      : a.id === 'termin_waehlen'
        ? `/kunde/faelle/${vm.claimId}/kalender`
        : a.zone
          ? `#zone-${a.zone}`
          : AUFGABE_ANCHOR[a.id]

  return (
    <Card p={4} className="space-y-2">
      <h2 className="text-body-sm font-semibold text-claimondo-navy">Ihre Aufgaben</h2>
      <ul className="space-y-1.5">
        {aufgaben.map((a) => (
          <li key={a.id}>
            <a
              href={hrefFor(a)}
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
