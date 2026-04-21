// AAR-112: Dispatch-Portal Isochrone-View
// Dispatch-User waehlt einen Lead aus der Liste und sieht sofort die
// besten SVs im Umkreis (sortiert nach findBestSV-Score inkl. Distanz,
// Paket-Prio, Auslastung, Ablehnungsquote).
// Eine Karten-Visualisierung ist bewusst reduziert — die Reservierung
// selbst passiert im Lead-Detail (SvDispatchPanel, AAR-115).
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import IsochroneClient from './IsochroneClient'
import ReadOnlyBanner from '../_components/ReadOnlyBanner'

export default async function DispatchIsochronePage() {
  const supabase = await createClient()

  // Leads mit Koordinaten fuer die Dropdown-Auswahl.
  // Semantik-Fix 2026-04-21: Isochrone/SV-Matching nutzt primaer den
  // Besichtigungsort (wo das Auto steht), Fallback auf Unfallort +
  // Kunden-Adresse fuer Legacy-Leads.
  const { data: leadsRaw } = await supabase
    .from('leads')
    .select('id, vorname, nachname, kunde_plz, besichtigungsort_lat, besichtigungsort_lng, unfallort_lat, unfallort_lng, kunde_lat, kunde_lng, qualifizierungs_phase, schadentyp, created_at')
    .not('qualifizierungs_phase', 'in', '("konvertiert","disqualifiziert","kalt")')
    .order('created_at', { ascending: false })
    .limit(100)

  const leads = (leadsRaw ?? [])
    .map((l) => {
      const rec = l as Record<string, unknown>
      const lat = (rec.besichtigungsort_lat ?? rec.unfallort_lat ?? rec.kunde_lat) as number | null
      const lng = (rec.besichtigungsort_lng ?? rec.unfallort_lng ?? rec.kunde_lng) as number | null
      return {
        id: rec.id as string,
        name: `${rec.vorname ?? ''} ${rec.nachname ?? ''}`.trim() || '—',
        plz: (rec.kunde_plz as string | null) ?? null,
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
        schadentyp: rec.schadentyp as string | null,
        phase: rec.qualifizierungs_phase as string,
      }
    })
    .filter((l) => l.lat != null && l.lng != null)

  return (
    <div className="py-6 space-y-6">
      <ReadOnlyBanner message="Nur-Lese-Ansicht — Isochrone-Polygone werden im Admin-Portal gepflegt." />
      <div>
        <h1 className="text-xl font-bold text-gray-900">Isochrone-Zuweisung</h1>
        <p className="text-sm text-gray-500 mt-1">
          Wähle einen Lead, um die besten SVs im Fahrzeit-Umkreis zu sehen.
          Die Reservierung selbst passiert im{' '}
          <Link href="/dispatch/leads" className="text-[#4573A2] hover:underline">
            Lead-Detail
          </Link>
          .
        </p>
      </div>

      <IsochroneClient leads={leads} />
    </div>
  )
}
