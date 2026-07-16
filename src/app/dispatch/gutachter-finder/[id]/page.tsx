import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EntityDetailShell from '@/components/shared/detail/EntityDetailShell'
import GutachterFinderDetailClient from './GutachterFinderDetailClient'

type RawAnfrage = {
  id: string
  vorname: string
  nachname: string
  email: string
  telefon: string | null
  kennzeichen: string | null
  fahrzeug_beschreibung: string | null
  schadentyp: string
  schadenort: string | null
  schadenort_lat: number | null
  schadenort_lng: number | null
  wunschtermin: string | null
  matching_typ: string | null
  sa_signatur_data_url: string | null
  sa_unterzeichnet_am: string | null
  status: string
  erstellt_am: string
  konvertiert_zu_lead_id: string | null
  zugeordneter_sv: {
    id: string
    firmenname: string | null
    profiles: { anzeigename: string | null; telefon: string | null } | { anzeigename: string | null; telefon: string | null }[] | null
  } | null
  sv_lead: { id: string; name: string; telefon: string | null; email: string | null } | null
}

export default async function GutachterFinderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('gutachter_finder_anfragen')
    .select(`
      id, vorname, nachname, email, telefon, kennzeichen, fahrzeug_beschreibung,
      schadentyp, schadenort, schadenort_lat, schadenort_lng, wunschtermin, matching_typ,
      sa_signatur_data_url, sa_unterzeichnet_am, status, erstellt_am, konvertiert_zu_lead_id,
      zugeordneter_sv:sachverstaendige!gutachter_finder_anfragen_zugeordneter_sv_id_fkey(
        id, firmenname,
        profiles!sachverstaendige_profile_id_fkey(anzeigename, telefon)
      ),
      sv_lead:sv_leads(id, name, telefon, email)
    `)
    .eq('id', id)
    .single()

  if (!raw) notFound()

  const r = raw as unknown as RawAnfrage
  const svRaw = Array.isArray(r.zugeordneter_sv) ? r.zugeordneter_sv[0] ?? null : r.zugeordneter_sv
  const svProfile = svRaw ? (Array.isArray(svRaw.profiles) ? svRaw.profiles[0] ?? null : svRaw.profiles) : null
  const svLead = Array.isArray(r.sv_lead) ? r.sv_lead[0] ?? null : r.sv_lead

  const anfrage = {
    ...r,
    sv_id: svRaw?.id ?? null,
    sv_name: svRaw?.firmenname ?? (svProfile as { anzeigename?: string | null } | null)?.anzeigename ?? null,
    sv_telefon: (svProfile as { telefon?: string | null } | null)?.telefon ?? null,
    sv_lead_id: svLead?.id ?? null,
    sv_lead_name: svLead?.name ?? null,
    sv_lead_telefon: svLead?.telefon ?? null,
    sv_lead_email: svLead?.email ?? null,
  }

  return (
    <EntityDetailShell
      title={`${anfrage.vorname} ${anfrage.nachname}`}
      backHref="/dispatch/gutachter-finder"
      backLabel="Übersicht"
      description={<span className="text-claimondo-ondo">{anfrage.schadentyp}</span>}
    >
      {/* Die Status-Workflow-Buttons leben bewusst im Body (Status-Card, rechts),
          nicht im Header-actions-Slot — 4 Aktionen sind zu viel fuer den Header. */}
      <div className="flex-1 overflow-y-auto p-4">
        <GutachterFinderDetailClient anfrage={anfrage} />
      </div>
    </EntityDetailShell>
  )
}
