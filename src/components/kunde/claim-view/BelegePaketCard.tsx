// WS6 Slice 1 — claim-type-aware Beleg-/Dokumenten-Download für den Kunden.
// Reparatur-Claim: KVA + Schlussrechnung + Schadenfotos. Normal-/SV-Claim: Gutachten + SV-Rechnung.
// Task B (DokumentVorschau): Vorschau-Button neben jedem Beleg-Download.
'use client'

import { Card, Button } from '@/components/primitives'
import { DownloadIcon, EyeIcon } from 'lucide-react'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'
import { useDokumentVorschau } from '@/components/shared/DokumentVorschau'

type Beleg = { label: string; url: string }

function belegeFor(vm: KundeClaimViewModel): Beleg[] {
  const belege: Beleg[] = []
  if (vm.flags.istReparaturRoute) {
    if (vm.geld.kvaPdfUrl) belege.push({ label: 'Kostenvoranschlag', url: vm.geld.kvaPdfUrl })
    if (vm.werkstatt.schlussrechnungUrl) belege.push({ label: 'Schlussrechnung', url: vm.werkstatt.schlussrechnungUrl })
    vm.werkstatt.schadensfotoUrls.forEach((url, i) => belege.push({ label: `Schadenfoto ${i + 1}`, url }))
  } else {
    if (vm.status.gutachtenUrl) belege.push({ label: 'Gutachten', url: vm.status.gutachtenUrl })
    if (vm.werkstatt.svRechnungUrl) belege.push({ label: 'SV-Rechnung', url: vm.werkstatt.svRechnungUrl })
  }
  return belege
}

export function BelegePaketCard({ vm }: { vm: KundeClaimViewModel }) {
  const belege = belegeFor(vm)
  const { oeffnen, modal } = useDokumentVorschau()

  if (belege.length === 0) return null
  return (
    <Card p={4} className="space-y-3">
      <h2 className="text-body-sm font-semibold text-claimondo-navy">Ihre Belege</h2>
      <p className="text-body-xs text-claimondo-ondo">Laden Sie Ihre Unterlagen herunter — z.B. für Ihren Versicherer.</p>
      <ul className="space-y-1.5">
        {belege.map((b) => (
          <li key={b.url} className="flex items-center gap-2">
            <a href={b.url} target="_blank" rel="noopener noreferrer" download
              className="flex-1 flex items-center justify-between gap-2 rounded-ios-sm bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy hover:bg-claimondo-border/40 transition-colors">
              <span>{b.label}</span>
              <DownloadIcon className="w-4 h-4 text-claimondo-ondo shrink-0" />
            </a>
            <Button
              variant="bare"
              size="icon"
              ariaLabel={`Vorschau: ${b.label}`}
              onClick={() => oeffnen({ url: b.url, dateiname: b.label, typ: null })}
            >
              <EyeIcon className="w-4 h-4 text-claimondo-ondo" />
            </Button>
          </li>
        ))}
      </ul>
      {modal}
    </Card>
  )
}
