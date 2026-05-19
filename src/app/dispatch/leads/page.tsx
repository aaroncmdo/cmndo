// AAR-179 P3-H + P3-I: Leads-Übersicht mit Liste/Kanban-Toggle.
// Server-Page lädt die Leads + rendert Phase-Filter-Chips. Die Darstellung
// (Tabelle oder Kanban) wandert in die Client-Component LeadsViewToggle.
import { createClient } from '@/lib/supabase/server'
import NeuLeadDrawer from './_components/NeuLeadDrawer'
import LeadsViewToggle from './_components/LeadsViewToggle'
import { PHASE_OPTIONS } from './_components/leadPhaseConstants'
import PageHeader from '@/components/shared/PageHeader'
import { Chip, ChipRow } from '@/components/ui/Chip'

export default async function DispatchLeads({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  // leads-Audit 15.05.2026 (#2): status + kunden_konstellation ergänzt. Vorher
  // lud die Liste nur qualifizierungs_phase — der Dispatcher sah den
  // lead_status (neu/rueckruf/quali-offen/…) und die Kunden-Konstellation
  // nicht, obwohl die RLS-Policy ihm vollen Lesezugriff gibt.
  //
  // 2026-05-19 (Aaron): zugewiesen_an + verlinktes profile mitladen, damit die
  // Liste anzeigt wer den Lead schon claimed hat (Doppel-Call-Schutz). FK
  // leads.zugewiesen_an → profiles.id existiert (leads_zugewiesen_an_fk).
  let query = supabase
    .from('leads')
    .select(
      `
      id, vorname, nachname, telefon, email,
      qualifizierungs_phase, status, kunden_konstellation,
      schadens_fall_typ, service_typ, source_channel,
      flow_link_geoeffnet, flow_link_abgeschlossen, whatsapp_verfuegbar,
      created_at, updated_at,
      zugewiesen_an,
      zugewiesen_an_profile:profiles!leads_zugewiesen_an_fk(id, vorname, nachname, avatar_url)
      `,
    )
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
            <span className="text-sm text-claimondo-ondo">{leads?.length ?? 0} Ergebnisse</span>
            <NeuLeadDrawer />
          </>
        }
      />

      {/* Filter — Touch-friendly Chips (Portal-Review C3) */}
      <ChipRow>
        {PHASE_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            href={opt.value ? `/dispatch/leads?phase=${opt.value}` : '/dispatch/leads'}
            className={`px-3 py-1.5 rounded-full text-xs font-medium leading-tight text-center transition-colors ${
              activePhase === opt.value
                ? 'bg-claimondo-navy text-white'
                : 'bg-white border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg'
            }`}
          >
            {opt.label}
          </Chip>
        ))}
      </ChipRow>

      {/* Liste / Kanban Toggle + View */}
      <LeadsViewToggle leads={leads ?? []} />

      {/* Floating Action Button — zentriert im Content-Bereich rechts der
          Sidebar. --app-sidebar-width wird vom PortalNav auf <html> gesetzt
          und ist auf Mobile 0px (Sidebar versteckt). */}
      <div
        className="fixed bottom-6 z-50"
        style={{
          left: 'calc(var(--app-sidebar-width, 0px) + (100vw - var(--app-sidebar-width, 0px)) / 2)',
          transform: 'translateX(-50%)',
        }}
      >
        <NeuLeadDrawer />
      </div>
    </div>
  )
}
