// C4a (Fundament, „Eine Akte"): KundeClaimView ist jetzt ein duenner Adapter auf den rollen-
// parametrisierten <FallAkte>-Kern (layout='columns'). Die Shell (Kopf + Multi-Fall-Zurueck-Link
// + Realtime + columns-2-Zonen-Loop mit id-Ankern) lebt im Kern (fall-akte/layouts/FallAkteColumns);
// hier bleibt nur die Kunde-config (Zonen-Ableitung, Zone-Komponenten, Header-/Adress-Aufbau).
// Ausgabe byte-identisch zur alten inline-Shell (Titel, Anker-ids, Reihenfolge, columns-Layout).

import { getTranslations } from 'next-intl/server'
import { FallAkte } from '@/components/fall-akte/FallAkte'
import type { FallAkteConfig } from '@/components/fall-akte/types'
import { deriveKundeZonen, type ZoneId } from '@/lib/claims/kunde-zonen'
import type { KundeClaimViewModel } from '@/lib/claims/kunde-claim-view'
import { StatusZone } from './StatusZone'
import { AufgabenZone } from './AufgabenZone'
import { TeamZone } from './TeamZone'
import { GeldZone } from './GeldZone'
import { DoksTermineZone } from './DoksTermineZone'

export async function KundeClaimView({ vm }: { vm: KundeClaimViewModel }) {
  const t = await getTranslations('kunde.fall')
  const { fall } = vm

  const kennzeichen = (fall.kennzeichen as string | null) ?? ''
  const fahrzeug = [fall.fahrzeug_hersteller as string | null, fall.fahrzeug_modell as string | null].filter(Boolean).join(' ')
  const adresse =
    (fall.besichtigungsort_adresse as string | null) ||
    (fall.unfallort as string | null) ||
    [fall.schadens_adresse as string | null, fall.schadens_plz as string | null, fall.schadens_ort as string | null].filter(Boolean).join(', ') ||
    ''
  const title = `${(fall.claim_nummer as string | null) ?? t('detail.schadensfall')}${kennzeichen ? ` · ${kennzeichen}` : ''}${fahrzeug ? ` — ${fahrzeug}` : ''}`

  const config: FallAkteConfig<KundeClaimViewModel, ZoneId> = {
    layout: 'columns',
    zones: (v) => deriveKundeZonen(v),
    zoneComponents: {
      status: StatusZone,
      aufgaben: AufgabenZone,
      team: TeamZone,
      geld: GeldZone,
      doksTermine: DoksTermineZone,
    },
    // title/adresse werden hier (async, mit t) vorab aufgeloest -> der Kern-Header bleibt i18n-frei.
    header: () => ({ title, description: adresse || null }),
    backLink: (v) => (v.hatMehrereFaelle ? { href: '/kunde', label: t('detail.meineFaelle') } : null),
    realtime: (v) => ({ fallId: v.fallId, claimId: v.claimId }),
  }

  return <FallAkte config={config} vm={vm} />
}
