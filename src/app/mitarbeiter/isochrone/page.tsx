// Mitarbeiter-Isochrone — Read-only Gebietsmatching aus KB-Sicht.
// KB wählt einen seiner betreuten Fälle/Leads und sieht die grundsätzlich
// geeigneten SVs im Fahrzeit-Umkreis (Logik via listSvSuggestionsForLead
// aus dem Dispatch-Portal, AAR-112/AAR-115). Reservierung + finale
// Zuweisung erfolgen weiter im Dispatch-Portal.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import IsochroneClient from '@/app/dispatch/isochrone/IsochroneClient'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterIsochronePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Fälle die ich als KB betreue — daraus die zugehörigen Leads mit
  // Koordinaten extrahieren. Semantik analog dispatch/isochrone:
  // besichtigungsort > unfallort > kunde-adresse.
  const { data: faelleRaw } = await supabase
    .from('faelle')
    .select('id, fall_nummer, lead_id, status')
    .eq('kundenbetreuer_id', user.id)
    .not('status', 'in', '("storniert","abgeschlossen")')
    .limit(200)

  const leadIds = Array.from(
    new Set((faelleRaw ?? []).map((f) => f.lead_id).filter(Boolean) as string[]),
  )

  const leadById: Record<string, string> = {}
  for (const f of faelleRaw ?? []) {
    if (f.lead_id && f.fall_nummer) leadById[f.lead_id] = f.fall_nummer
  }

  let leads: Array<{
    id: string
    name: string
    plz: string | null
    lat: number | null
    lng: number | null
    schadentyp: string | null
    phase: string
  }> = []

  if (leadIds.length > 0) {
    const { data: leadRows } = await supabase
      .from('leads')
      .select(
        'id, vorname, nachname, kunde_plz, besichtigungsort_lat, besichtigungsort_lng, unfallort_lat, unfallort_lng, kunde_lat, kunde_lng, qualifizierungs_phase, schadentyp',
      )
      .in('id', leadIds)

    leads = (leadRows ?? [])
      .map((l) => {
        const rec = l as Record<string, unknown>
        const lat = (rec.besichtigungsort_lat ?? rec.unfallort_lat ?? rec.kunde_lat) as number | null
        const lng = (rec.besichtigungsort_lng ?? rec.unfallort_lng ?? rec.kunde_lng) as number | null
        const fallNummer = leadById[rec.id as string]
        const name = `${rec.vorname ?? ''} ${rec.nachname ?? ''}`.trim() || '—'
        return {
          id: rec.id as string,
          name: fallNummer ? `${fallNummer} · ${name}` : name,
          plz: (rec.kunde_plz as string | null) ?? null,
          lat: lat != null ? Number(lat) : null,
          lng: lng != null ? Number(lng) : null,
          schadentyp: rec.schadentyp as string | null,
          phase: rec.qualifizierungs_phase as string,
        }
      })
      .filter((l) => l.lat != null && l.lng != null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gebiets-Übersicht"
        size="lg"
        description={
          <>
            Wähle einen deiner betreuten Fälle, um die grundsätzlich geeigneten SVs im Fahrzeit-Umkreis zu sehen.
            Reservierung + Zuweisung erfolgen im{' '}
            <Link href="/dispatch/isochrone" className="text-[#4573A2] hover:underline">
              Dispatch-Portal
            </Link>
            .
          </>
        }
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Nur-Lese-Ansicht — alle Änderungen an Fall-Zuweisung oder Isochrone-Polygon erfolgen durch das Admin/Dispatch-Team.
      </div>

      <IsochroneClient leads={leads} />
    </div>
  )
}
