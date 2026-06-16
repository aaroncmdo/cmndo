// AAR-179 P3-H + P3-I: Leads-Übersicht mit Liste/Kanban-Toggle.
// Server-Page lädt die Leads + rendert Phase-Filter-Chips. Die Darstellung
// (Tabelle oder Kanban) wandert in die Client-Component LeadsViewToggle.
import { createClient } from '@/lib/supabase/server'
import NeuLeadDrawer from './_components/NeuLeadDrawer'
import LeadsViewToggle from './_components/LeadsViewToggle'
import { PHASE_OPTIONS } from './_components/leadPhaseConstants'
import PageHeader from '@/components/shared/PageHeader'
import { Chip, ChipRow } from '@/components/ui/Chip'
import { ladeLeadTerminGutachter } from '@/lib/dispatch/lade-lead-termin-gutachter'

export default async function DispatchLeads({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string; filter?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  // AAR-956 Self-Service #4: Abbrecher-Filter. Leads, die den FlowLink geoeffnet,
  // aber nicht abgeschlossen haben (status != disqualifiziert). Der Dispatcher
  // ruft sie an (alle Daten inkl. Mail liegen vor). Eigene Filter-Dimension,
  // orthogonal zu den Phase-Chips; sortiert nach letzter Aktivitaet (updated_at).
  const istAbbrecherFilter = params.filter === 'abbrecher'

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
    .limit(200)

  if (istAbbrecherFilter) {
    query = query
      .eq('flow_link_geoeffnet', true)
      .eq('flow_link_abgeschlossen', false)
      .neq('status', 'disqualifiziert')
      .order('updated_at', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
    if (params.phase) {
      query = query.eq('qualifizierungs_phase', params.phase)
    }
  }

  const { data: leads } = await query
  const activePhase = istAbbrecherFilter ? '' : (params.phase ?? '')

  // AAR-956: Single-Source Termin + Gutachter pro Lead (v_lead_termin_gutachter)
  // batch nachladen — gibt dem Dispatcher in der Liste auf einen Blick, ob ein
  // Lead schon einen Termin und/oder einen Gutachter hat (Self-Service-Leads
  // bringen beides aus dem Embed-Flow mit, bevor der Dispatcher draufschaut).
  const terminGutachter = await ladeLeadTerminGutachter((leads ?? []).map((l) => l.id))

  // Abbrecher-Zaehler fuer den Chip-Badge (immer berechnen, auch ausserhalb des
  // Filters): gibt dem Dispatcher ein dauerhaftes glanceable Signal.
  const { count: abbrecherCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('flow_link_geoeffnet', true)
    .eq('flow_link_abgeschlossen', false)
    .neq('status', 'disqualifiziert')

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
              !istAbbrecherFilter && activePhase === opt.value
                ? 'bg-claimondo-navy text-white'
                : 'bg-white border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg'
            }`}
          >
            {opt.label}
          </Chip>
        ))}
        {/* AAR-956 #4: Abbrecher — FlowLink geoeffnet, nicht abgeschlossen. Eigene
            Filter-Dimension (amber = Achtung, wie das FlowLink-Offen-Badge). */}
        <Chip
          href="/dispatch/leads?filter=abbrecher"
          className={`px-3 py-1.5 rounded-full text-xs font-medium leading-tight text-center transition-colors ${
            istAbbrecherFilter
              ? 'bg-amber-500 text-white'
              : 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
          }`}
        >
          Abbrecher{typeof abbrecherCount === 'number' ? ` (${abbrecherCount})` : ''}
        </Chip>
      </ChipRow>

      {/* Liste / Kanban Toggle + View */}
      <LeadsViewToggle leads={leads ?? []} terminGutachter={terminGutachter} />

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
