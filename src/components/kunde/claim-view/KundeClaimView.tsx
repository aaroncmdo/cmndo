// P1/P4 (Kunde-Detail-Rebuild): die Shell — Kopf (Claim-Nr/Kennzeichen/Fahrzeug/Adresse +
// Multi-Fall-Zurueck-Link, wie Live-page.tsx) + die sichtbaren Zonen in mobiler Reihenfolge
// (deriveKundeZonen, phasen-adaptiv). Jede Zone bekommt einen id-Anker, damit die AufgabenZone-CTAs
// dorthin springen. Mobile-first (schmale, zentrierte Spalte).

import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'
import { deriveKundeZonen } from '@/lib/claims/kunde-zonen'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'
import { StatusZone } from './StatusZone'
import { AufgabenZone } from './AufgabenZone'
import { TeamZone } from './TeamZone'
import { GeldZone } from './GeldZone'
import { DoksTermineZone } from './DoksTermineZone'

export async function KundeClaimView({ vm }: { vm: KundeClaimViewModel }) {
  const t = await getTranslations('kunde.fall')
  const zonen = deriveKundeZonen(vm)
  const { fall } = vm

  const kennzeichen = (fall.kennzeichen as string | null) ?? ''
  const fahrzeug = [fall.fahrzeug_hersteller as string | null, fall.fahrzeug_modell as string | null].filter(Boolean).join(' ')
  const adresse =
    (fall.besichtigungsort_adresse as string | null) ||
    (fall.unfallort as string | null) ||
    [fall.schadens_adresse as string | null, fall.schadens_plz as string | null, fall.schadens_ort as string | null].filter(Boolean).join(', ') ||
    ''
  const title = `${(fall.claim_nummer as string | null) ?? t('detail.schadensfall')}${kennzeichen ? ` · ${kennzeichen}` : ''}${fahrzeug ? ` — ${fahrzeug}` : ''}`

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <div>
        {vm.hatMehrereFaelle && (
          <Link href="/kunde" className="text-body-xs text-claimondo-ondo/70 hover:text-claimondo-ondo mb-2 inline-block">
            &larr; {t('detail.meineFaelle')}
          </Link>
        )}
        <PageHeader title={title} description={adresse || undefined} />
      </div>

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
          case 'doksTermine':
            return (
              <div id="zone-doksTermine" key={z}>
                <DoksTermineZone vm={vm} />
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
