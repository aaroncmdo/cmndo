import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import FlowWizardKfz from './FlowWizardKfz'

export default async function FlowPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  try {
  const svc = createServiceClient()

  // 1. Look up flow_links by token + check expiry (BUG-100)
  const { data: flowLink } = await svc
    .from('flow_links')
    .select('id, lead_id, status, geoeffnet_am, expires_at')
    .eq('token', token)
    .maybeSingle()

  // Fallback: Try token as lead_id directly (backward compat)
  let leadId: string
  let flowLinkId: string | null = null

  if (flowLink) {
    // BUG-100: Token-Expiry prüfen
    if (flowLink.expires_at && new Date(flowLink.expires_at) < new Date()) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
            <div className="text-4xl mb-4">&#x23F3;</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Link abgelaufen</h1>
            <p className="text-gray-500">Dieser FlowLink ist nicht mehr gueltig. Bitte kontaktieren Sie Ihren Berater fuer einen neuen Link.</p>
          </div>
        </div>
      )
    }

    // BUG-100: Bereits abgeschlossene Links blockieren
    if (flowLink.status === 'abgeschlossen') {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
            <div className="text-4xl mb-4">&#x2705;</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Bereits abgeschlossen</h1>
            <p className="text-gray-500">Dieser FlowLink wurde bereits verwendet.</p>
          </div>
        </div>
      )
    }

    leadId = flowLink.lead_id
    flowLinkId = flowLink.id

    // Mark as opened if first visit
    if (!flowLink.geoeffnet_am) {
      await svc.from('flow_links').update({ geoeffnet_am: new Date().toISOString(), status: 'geoeffnet' }).eq('id', flowLink.id)
      await svc.from('leads').update({ flow_link_geoeffnet: true, updated_at: new Date().toISOString() }).eq('id', leadId)
    }

    // KFZ-207: Auto-Reaktivierung kalt-Lead wenn FlowLink geöffnet wird
    const { data: lead } = await svc.from('leads').select('qualifizierungs_phase, vorname, nachname').eq('id', leadId).single()
    if (lead?.qualifizierungs_phase === 'kalt') {
      await svc.from('leads').update({ qualifizierungs_phase: 'in-qualifizierung', updated_at: new Date().toISOString() }).eq('id', leadId)
      await svc.from('tasks').insert({ titel: `Lead reaktiviert: ${lead.vorname ?? ''} ${lead.nachname ?? ''} (FlowLink geöffnet)`, typ: 'dispatch', prioritaet: 'dringend', status: 'offen' })
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

  } catch (err) {
    console.error('[FlowPage] Server Error:', err)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="text-center max-w-md">
          <h1 className="text-lg font-semibold text-red-600 mb-2">Fehler beim Laden</h1>
          <p className="text-gray-500 text-sm">Bitte versuchen Sie es erneut oder kontaktieren Sie uns.</p>
        </div>
      </div>
    )
  }
}
