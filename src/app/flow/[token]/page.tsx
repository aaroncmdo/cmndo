import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import FlowWizardKfz from './FlowWizardKfz'

export default async function FlowPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()
  const svc = createServiceClient()

  // 1. Look up flow_links by token
  const { data: flowLink } = await svc
    .from('flow_links')
    .select('id, lead_id, status, geoeffnet_am')
    .eq('token', token)
    .maybeSingle()

  // Fallback: Try token as lead_id directly (backward compat)
  let leadId: string
  let flowLinkId: string | null = null

  if (flowLink) {
    leadId = flowLink.lead_id
    flowLinkId = flowLink.id

    // Mark as opened if first visit
    if (!flowLink.geoeffnet_am) {
      await svc.from('flow_links').update({ geoeffnet_am: new Date().toISOString(), status: 'geoeffnet' }).eq('id', flowLink.id)
      await svc.from('leads').update({ flow_link_geoeffnet: true, updated_at: new Date().toISOString() }).eq('id', leadId)
    }
  } else {
    // Backward compat: token might be lead_id
    leadId = token
  }

  // 2. Load lead data (extended for KFZ-117 FlowLink flow)
  const { data: lead } = await svc
    .from('leads')
    .select(`
      id, vorname, nachname, email, telefon,
      schadenfall_typ, kunden_konstellation, sf_variante, schadensursache,
      personenschaden_flag, mietwagen_flag,
      polizeibericht_pflicht, polizei_vor_ort, gutachter_termin,
      kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_farbe, erstzulassung, fin,
      fahrzeug_standort_adresse, fahrzeug_standort_plz,
      gegner_name, gegner_versicherung, gegner_kennzeichen,
      eigene_versicherung, eigene_policennr,
      unfallhergang
    `)
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) return notFound()

  return (
    <FlowWizardKfz
      token={token}
      flowLinkId={flowLinkId}
      lead={{
        id: lead.id,
        vorname: lead.vorname ?? '',
        nachname: lead.nachname ?? '',
        email: lead.email ?? '',
        telefon: lead.telefon ?? '',
        schadenfall_typ: lead.schadenfall_typ ?? 'sf-01',
        kunden_konstellation: lead.kunden_konstellation ?? 'kk-01',
        personenschaden_flag: lead.personenschaden_flag ?? false,
        mietwagen_flag: lead.mietwagen_flag ?? false,
        polizeibericht_pflicht: lead.polizeibericht_pflicht ?? false,
        polizei_vor_ort: lead.polizei_vor_ort ?? false,
        gutachter_termin: lead.gutachter_termin ?? null,
        kennzeichen: lead.kennzeichen ?? '',
        fahrzeug_hersteller: lead.fahrzeug_hersteller ?? '',
        fahrzeug_modell: lead.fahrzeug_modell ?? '',
        fahrzeug_standort_adresse: lead.fahrzeug_standort_adresse ?? '',
        fahrzeug_standort_plz: lead.fahrzeug_standort_plz ?? '',
        gegner_name: lead.gegner_name ?? '',
        gegner_versicherung: lead.gegner_versicherung ?? '',
        unfallhergang: lead.unfallhergang ?? '',
      }}
    />
  )
}
