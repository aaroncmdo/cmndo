import type { Metadata } from 'next'
import { GutachterFinderClient } from './GutachterFinderClient'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'

export const metadata: Metadata = {
  title: 'Gutachter finden — Claimondo',
  description: 'Finden Sie sofort den nächsten zertifizierten Kfz-Sachverständigen in Ihrer Nähe.',
}

export default async function GutachterFindenPage() {
  const [svResult, leadsResult] = await Promise.all([ladeAktiveSVs(), ladeSvLeads()])

  const aktiveSVs = svResult.ok ? svResult.data : []
  const svLeads = leadsResult.ok ? leadsResult.data : []

  return (
    <GutachterFinderClient
      aktiveSVs={aktiveSVs}
      svLeads={svLeads}
    />
  )
}
