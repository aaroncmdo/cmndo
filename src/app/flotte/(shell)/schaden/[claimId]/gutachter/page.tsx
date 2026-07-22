// T5.2 (operativer-schaden-flow): FM-Gutachter-Picker-Seite. FM-gegatet (shell-Layout +
// resolveSchadenFortsetzung = Claim-Ownership). Lädt Default-Kandidaten (Firma-Adresse als
// Besichtigungsort-Default) und rendert den Client-Picker.
import { notFound } from 'next/navigation'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { geocodeMitFallback } from '@/lib/termine/engine/geocode'
import {
  resolveSchadenFortsetzung,
  ladeGutachterKandidaten,
  type GutachterKandidat,
  type Haftungstyp,
} from '@/lib/flotte/schaden-fortsetzung'
import { GutachterPickerClient } from './GutachterPickerClient'

export const dynamic = 'force-dynamic'

export default async function GutachterPickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ claimId: string }>
  searchParams: Promise<{ typ?: string }>
}) {
  const { claimId } = await params
  const { typ } = await searchParams
  const haftungstyp: Haftungstyp = typ === 'selbstverschuldet' ? 'selbstverschuldet' : 'haftpflicht'

  const { user } = await requirePortalAccess(['flottenmanager'])
  const ctx = await resolveSchadenFortsetzung(claimId, user.id)
  if (!ctx) notFound()

  let initialKandidaten: GutachterKandidat[] = []
  let initialKind: 'partner' | 'fallback' = 'fallback'
  if (ctx.defaultAdresse) {
    const geo = await geocodeMitFallback(ctx.defaultAdresse)
    if (geo) {
      const res = await ladeGutachterKandidaten(geo.lat, geo.lng)
      initialKandidaten = res.kandidaten
      initialKind = res.kind
    }
  }

  return (
    <GutachterPickerClient
      claimId={claimId}
      kennzeichen={ctx.kennzeichen}
      defaultAdresse={ctx.defaultAdresse ?? ''}
      haftungstyp={haftungstyp}
      initialKandidaten={initialKandidaten}
      initialKind={initialKind}
    />
  )
}
