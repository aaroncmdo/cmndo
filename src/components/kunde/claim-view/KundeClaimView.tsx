// P1/P4 (Kunde-Detail-Rebuild): die Shell — Kopf (Claim-Nr/Kennzeichen/Fahrzeug/Adresse +
// Multi-Fall-Zurueck-Link, wie Live-page.tsx) + die sichtbaren Zonen in mobiler Reihenfolge
// (deriveKundeZonen, phasen-adaptiv). Jede Zone bekommt einen id-Anker, damit die AufgabenZone-CTAs
// dorthin springen. Mobile-first (schmale, zentrierte Spalte).

import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'
import FallRealtimeRefresh from '@/components/fall/FallRealtimeRefresh'
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
    <div className="mx-auto px-4 pt-5 pb-8 max-w-xl lg:max-w-5xl">
      {/* Live-Aktualisierung: abonniert gutachter_termine/auftraege/faelle des Falls und
          refresht die server-gerenderten Zonen bei jedem Event (AAR-864-Muster). */}
      <FallRealtimeRefresh fallId={vm.fallId} claimId={vm.claimId} />

      <div className="mb-4">
        {vm.hatMehrereFaelle && (
          <Link href="/kunde" className="text-body-xs text-claimondo-ondo/70 hover:text-claimondo-ondo mb-2 inline-block">
            &larr; {t('detail.meineFaelle')}
          </Link>
        )}
        <PageHeader title={title} description={adresse || undefined} />
      </div>

      {/* Mobile: fokussierte Single-Column in deriveKundeZonen-Reihenfolge.
          Desktop (lg): dieselben Zonen in 2 Spalten (CSS-Columns) — Single-Render,
          daher bleiben die id-Anker (AufgabenZone-CTA-Sprungziele) + die Reihenfolge
          erhalten; break-inside-avoid haelt jede Zone zusammen. */}
      <div className="lg:columns-2 lg:gap-6">
        {zonen.map((z) => {
          switch (z) {
            case 'status':
              return (
                <div id="zone-status" key={z} className="mb-4 break-inside-avoid">
                  <StatusZone vm={vm} />
                </div>
              )
            case 'aufgaben':
              return (
                <div id="zone-aufgaben" key={z} className="mb-4 break-inside-avoid">
                  <AufgabenZone vm={vm} />
                </div>
              )
            case 'team':
              return (
                <div id="zone-team" key={z} className="mb-4 break-inside-avoid">
                  <TeamZone vm={vm} />
                </div>
              )
            case 'geld':
              return (
                <div id="zone-geld" key={z} className="mb-4 break-inside-avoid">
                  <GeldZone vm={vm} />
                </div>
              )
            case 'doksTermine':
              return (
                <div id="zone-doksTermine" key={z} className="mb-4 break-inside-avoid">
                  <DoksTermineZone vm={vm} />
                </div>
              )
            default:
              return null
          }
        })}
      </div>
    </div>
  )
}
