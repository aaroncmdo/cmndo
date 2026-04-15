// AAR-137 / W3: Dispatch-Lead-Detail Server-Component.
// Lädt Lead + SV-Termin + FlowLinks + Calls und delegiert alles an DispatchShell.
// Das alte 2-Column-Grid-Layout ist durch die DispatchShell ersetzt worden —
// siehe AAR-137 für die Spec. Die alte Logik für HardGate / SvDispatch /
// FlowLink bleibt in den Phase-Stubs bis W4-W8 echte Phase-Components bauen.

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DispatchShell from './DispatchShell'
import { computeQualificationStatus } from './lib/qualification-engine'
import type { Phase } from './lib/phase-context'

export default async function DispatchLeadDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (!lead) notFound()

  // flow_links hat erstellt_am (nicht created_at) — das ursprüngliche Select
  // hat stillschweigend die Spalte ignoriert weil der Supabase-Client bei
  // unbekannten Spaltennamen nur einen Warn loggt; wir brauchen das Feld für
  // den Inaktiv-Alarm in Phase 6 und aliasen daher direkt auf `created_at`.
  const { data: flowLinksRaw } = await supabase
    .from('flow_links')
    .select('id, token, status, erstellt_am, expires_at, geoeffnet_am, abgeschlossen_am, fall_id')
    .eq('lead_id', id)
    .order('erstellt_am', { ascending: false })
    .limit(5)
  const flowLinks = (flowLinksRaw ?? []).map((fl) => ({
    id: fl.id as string,
    token: fl.token as string,
    status: fl.status as string,
    created_at: fl.erstellt_am as string,
    expires_at: fl.expires_at as string,
    geoeffnet_am: (fl.geoeffnet_am ?? null) as string | null,
    abgeschlossen_am: (fl.abgeschlossen_am ?? null) as string | null,
    fall_id: (fl.fall_id ?? null) as string | null,
  }))

  // Phase 6 Status-Tracking Snapshot. Sowohl sa_unterschrieben als auch
  // vollmacht_unterschrieben leben auf der leads-Tabelle (siehe BUG-15
  // Migration 20260330). Die faelle-Tabelle kennt zwar sa_unterschrieben,
  // aber KEIN vollmacht_unterschrieben (nur vollmacht_geprueft_am +
  // vollmacht_pruefung_status von LexDrive/AAR-69). Für die Dispatch-Ansicht
  // ist das leads-Flag die relevante Quelle — setzt autoPhase und der
  // FlowWizard setzt es nach SA/Vollmacht-Unterschrift.
  const unterschriftenSnapshot =
    lead.sa_unterschrieben || lead.vollmacht_unterschrieben
      ? {
          sa_unterschrieben: lead.sa_unterschrieben ?? null,
          vollmacht_unterschrieben: lead.vollmacht_unterschrieben ?? null,
        }
      : null

  // AAR-115 + AAR-134: aktiver SV-Termin — alle relevanten Status mitlesen
  const { data: svTerminRaw } = await supabase
    .from('gutachter_termine')
    .select('id, sv_id, start_zeit, end_zeit, status, sv_ablehnung_grund, sv_vorgeschlagene_slots, sachverstaendige(profiles(vorname, nachname))')
    .eq('lead_id', id)
    .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag', 'abgelehnt'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const svTerminRow = svTerminRaw as {
    id: string
    sv_id: string
    start_zeit: string
    end_zeit: string
    status: string
    sv_ablehnung_grund: string | null
    sv_vorgeschlagene_slots: { start: string; end: string }[] | null
    sachverstaendige: unknown
  } | null
  const svRel = svTerminRow?.sachverstaendige
  const sv = (Array.isArray(svRel) ? svRel[0] : svRel) as { profiles: unknown } | null
  const profileRel = sv?.profiles
  const svProfile = (Array.isArray(profileRel) ? profileRel[0] : profileRel) as
    | { vorname: string | null; nachname: string | null }
    | null
  const aktiverSvTermin = svTerminRow
    ? {
        id: svTerminRow.id,
        sv_id: svTerminRow.sv_id,
        sv_vorname: svProfile?.vorname ?? null,
        sv_nachname: svProfile?.nachname ?? null,
        start_zeit: svTerminRow.start_zeit,
        end_zeit: svTerminRow.end_zeit,
        status: svTerminRow.status,
        sv_ablehnung_grund: svTerminRow.sv_ablehnung_grund,
        sv_vorgeschlagene_slots: svTerminRow.sv_vorgeschlagene_slots,
      }
    : null

  // Initial-Phase aus Daten ableiten (erste unvollständige Phase)
  const qual = computeQualificationStatus(lead, aktiverSvTermin)
  const latestFlow = flowLinks[0]
  const flowLinkGesendet = !!latestFlow && latestFlow.status !== 'abgelaufen'
  const saUnterschrieben = !!lead.sa_unterschrieben

  let initialPhase: Phase = 1
  if (!(qual.q1_schuldfrage && qual.q2_schaden && qual.q3_polizei)) initialPhase = 1
  else if (!qual.q5_svTermin) initialPhase = 2
  else if (!qual.q4_schadentyp) initialPhase = 3
  else if (!qual.q6_gegnerKz) initialPhase = 4
  else if (!flowLinkGesendet) initialPhase = 5
  else initialPhase = 6

  return (
    <DispatchShell
      lead={lead}
      aktiverTermin={aktiverSvTermin}
      flowLinks={flowLinks}
      fall={unterschriftenSnapshot}
      initialPhase={initialPhase}
      saUnterschrieben={saUnterschrieben}
    />
  )
}
