// AAR-179 P3-H + P3-I: Leads-Übersicht mit Liste/Kanban-Toggle.
// Server-Page lädt die Leads + rendert Phase-Filter-Chips. Die Darstellung
// (Tabelle oder Kanban) wandert in die Client-Component LeadsViewToggle.
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import NeuLeadDrawer from './_components/NeuLeadDrawer'
import LeadsViewToggle from './_components/LeadsViewToggle'
import { PHASE_OPTIONS } from './_components/leadPhaseConstants'
import PageHeader from '@/components/shared/PageHeader'

export default async function DispatchLeads({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('leads')
    .select('id, vorname, nachname, telefon, email, qualifizierungs_phase, schadens_fall_typ, service_typ, source_channel, flow_link_geoeffnet, flow_link_abgeschlossen, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (params.phase) {
    query = query.eq('qualifizierungs_phase', params.phase)
  }

  const { data: leads } = await query
  const activePhase = params.phase ?? ''

  return (
    <div className="py-6 space-y-4">
      <PageHeader
        title="Leads"
        actions={
          <>
            <span className="text-sm text-gray-500">{leads?.length ?? 0} Ergebnisse</span>
            <NeuLeadDrawer />
          </>
        }
      />

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5">
        {PHASE_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={opt.value ? `/dispatch/leads?phase=${opt.value}` : '/dispatch/leads'}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activePhase === opt.value
                ? 'bg-[#0D1B3E] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {/* Liste / Kanban Toggle + View */}
      <LeadsViewToggle leads={leads ?? []} />
    </div>
  )
}
