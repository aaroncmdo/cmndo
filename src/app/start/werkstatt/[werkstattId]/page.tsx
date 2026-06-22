// AAR-956 Task 7 — Statischer Werkstatt-QR-Einstieg.
//
// Eine Werkstatt druckt den QR-Code mit der URL /start/werkstatt/[werkstattId].
// Kein HMAC (werkstattId ist ein opaker, nicht-geheimer Identifier — nur aktive
// Werkstaetten oeffnen den Wizard; inaktive + nicht gefundene → Redirect /gutachter-finden).
//
// Diese Server-Component validiert die Werkstatt, montiert anschliessend den
// normalen FinderWizard mit werkstattId/Name/Geo als Props (werden an
// reserviereEmbedTermin durchgereicht) — identisch dem Embed-Flow, aber als
// First-Party-Page (keine iframe-URL, kein FinderMap-Wrapper notwendig).

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'
import { FinderMap } from '@/app/embed/gutachter-finder/_components/FinderMap'
import { FinderWizard } from '@/app/embed/gutachter-finder/_components/FinderWizard'

export const dynamic = 'force-dynamic'

export default async function WerkstattStartPage({
  params,
}: {
  params: Promise<{ werkstattId: string }>
}) {
  const { werkstattId } = await params

  const supabase = createAdminClient()
  const { data: werkstatt } = await supabase
    .from('werkstaetten')
    .select('id, name, status, lat, lng, adresse_strasse, adresse_plz, adresse_ort')
    .eq('id', werkstattId)
    .maybeSingle()

  if (!werkstatt || werkstatt.status !== 'aktiv') {
    redirect('/gutachter-finden')
  }

  const adresse = `${werkstatt.adresse_strasse}, ${werkstatt.adresse_plz} ${werkstatt.adresse_ort}`

  const [aktiveRes, leadsRes] = await Promise.all([ladeAktiveSVs(), ladeSvLeads()])
  const svs = aktiveRes.ok ? aktiveRes.data : []
  const leadPins = leadsRes.ok ? leadsRes.data : []

  // Der FinderWizard wird in denselben FinderMap-Wrapper montiert wie im Embed,
  // damit die Karte + Wizard-Interaktion (Ort-Pin, SV-Highlight, Bottom-Sheet) funktioniert.
  // werkstattId/Name/Geo fliessen als Props in den Wizard — dieser reicht sie an
  // reserviereEmbedTermin weiter (Task 7). Die „Auto bei Werkstatt?"-UI kommt in Task 10.
  const initialCenter =
    typeof werkstatt.lat === 'number' && typeof werkstatt.lng === 'number'
      ? { lat: werkstatt.lat as number, lng: werkstatt.lng as number }
      : null

  return (
    <FinderMap
      svLeads={leadPins}
      aktiveSVs={svs}
      height="100dvh"
      initialCenter={initialCenter}
      initialZoom={13}
      forceFallback={false}
      wizardSlot={
        <FinderWizard
          forceFallback={false}
          werkstattId={werkstatt.id}
          werkstattName={werkstatt.name}
          werkstattGeo={{
            lat: werkstatt.lat as number,
            lng: werkstatt.lng as number,
            adresse,
          }}
        />
      }
    />
  )
}
