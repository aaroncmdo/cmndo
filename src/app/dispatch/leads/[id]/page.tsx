import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, PhoneIcon, MailIcon, CarIcon, ShieldIcon } from 'lucide-react'
import LeadDetailActions from './LeadDetailActions'
import Schritt0HardGate from './Schritt0HardGate'
import SchadentypPicker from './SchadentypPicker'
import CardentityButton from './CardentityButton'
import AircallCallButton from '@/components/AircallCallButton'
import { computeHardGateStatus } from './hard-gate-utils'
import { computeFlowLinkStufe, FLOWLINK_STUFE_LABEL } from '@/lib/dispatch/fahrzeug-marken'

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

  // FlowLink-Status
  const { data: flowLinks } = await supabase
    .from('flow_links')
    .select('id, token, status, created_at, expires_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Kontakthistorie (Calls + WhatsApp)
  const { data: calls } = await supabase
    .from('aircall_calls')
    .select('id, direction, started_at, duration, status')
    .eq('lead_id', id)
    .order('started_at', { ascending: false })
    .limit(10)

  const phaseLabel: Record<string, string> = {
    'neu': 'Neu', 'nicht-erreicht': 'Nicht erreicht', 'rueckruf': 'Rückruf',
    'in-qualifizierung': 'In Qualifizierung', 'flow-versendet': 'Flow gesendet',
    'sa-ausstehend': 'SA ausstehend', 'konvertiert': 'Konvertiert',
    'disqualifiziert': 'Disqualifiziert', 'kalt': 'Kalt',
  }

  const phaseColor: Record<string, string> = {
    'neu': 'bg-blue-100 text-blue-700', 'nicht-erreicht': 'bg-gray-100 text-gray-600',
    'rueckruf': 'bg-amber-100 text-amber-700', 'in-qualifizierung': 'bg-violet-100 text-violet-700',
    'flow-versendet': 'bg-emerald-100 text-emerald-700', 'konvertiert': 'bg-green-100 text-green-800',
    'disqualifiziert': 'bg-red-100 text-red-700', 'kalt': 'bg-gray-200 text-gray-500',
  }

  // AAR-82 B-09: 6-stufige FlowLink-Status-Anzeige
  const latestFlow = flowLinks?.[0]
  const flowStufe = computeFlowLinkStufe(lead, latestFlow)
  const flowStufeBadge = FLOWLINK_STUFE_LABEL[flowStufe]
  // Legacy mapping fuer LeadDetailActions
  let flowStatus: 'none' | 'offen' | 'abgeschlossen' | 'abgelaufen' = 'none'
  if (flowStufe === 'abgeschlossen') flowStatus = 'abgeschlossen'
  else if (flowStufe === 'abgelaufen') flowStatus = 'abgelaufen'
  else if (flowStufe !== 'nicht_gesendet') flowStatus = 'offen'

  const flowBadge = {
    none: { label: 'Kein FlowLink', cls: 'bg-gray-100 text-gray-500' },
    offen: { label: flowStufeBadge.label, cls: flowStufeBadge.cls },
    abgeschlossen: { label: 'FlowLink abgeschlossen', cls: 'bg-green-100 text-green-700' },
    abgelaufen: { label: 'FlowLink abgelaufen', cls: 'bg-red-100 text-red-700' },
  }[flowStatus]

  return (
    <div className="py-6 space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link href="/dispatch/leads" className="text-gray-400 hover:text-gray-600">
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{lead.vorname} {lead.nachname}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${phaseColor[lead.qualifizierungs_phase] ?? 'bg-gray-100 text-gray-600'}`}>
              {phaseLabel[lead.qualifizierungs_phase] ?? lead.qualifizierungs_phase}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${flowBadge.cls}`}>
              {flowBadge.label}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Lead Data */}
        <div className="lg:col-span-2 space-y-4">
          {/* AAR-80: Schritt 0 Hard Gate */}
          <Schritt0HardGate lead={lead as Parameters<typeof Schritt0HardGate>[0]['lead']} />

          {/* AAR-81+83: Schadentyp Picker + Parkplatz-Kamera */}
          <SchadentypPicker
            leadId={lead.id}
            initialTyp={lead.schadentyp as Parameters<typeof SchadentypPicker>[0]['initialTyp']}
            initialFreitext={lead.schadentyp_freitext}
            gegnerKennzeichen={lead.gegner_kennzeichen}
            initialKamera={lead.parkplatz_kamera}
          />

          {/* Kontaktdaten */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Kontaktdaten</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <PhoneIcon className="w-4 h-4 text-gray-400" />
                {lead.telefon ? (
                  <>
                    <a href={`tel:${lead.telefon}`} className="text-[#4573A2] hover:underline">{lead.telefon}</a>
                    <AircallCallButton phoneNumber={lead.telefon} leadId={lead.id} variant="icon" />
                  </>
                ) : <span className="text-gray-400">—</span>}
              </div>
              <div className="flex items-center gap-2">
                <MailIcon className="w-4 h-4 text-gray-400" />
                {lead.email ? (
                  <a href={`mailto:${lead.email}`} className="text-[#4573A2] hover:underline">{lead.email}</a>
                ) : <span className="text-gray-400">—</span>}
              </div>
            </div>
          </div>

          {/* Fahrzeug + Schaden */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CarIcon className="w-4 h-4 text-gray-400" /> Fahrzeug & Schaden
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><p className="text-[10px] text-gray-400 uppercase">Kennzeichen</p><p className="font-medium">{lead.kennzeichen || '—'}</p></div>
              <div><p className="text-[10px] text-gray-400 uppercase">Hersteller</p><p className="font-medium">{lead.fahrzeug_hersteller || '—'}</p></div>
              <div><p className="text-[10px] text-gray-400 uppercase">Modell</p><p className="font-medium">{lead.fahrzeug_modell || '—'}</p></div>
              <div><p className="text-[10px] text-gray-400 uppercase">Schadenfall</p><p className="font-medium">{lead.schadenfall_typ || '—'}</p></div>
              <div><p className="text-[10px] text-gray-400 uppercase">Schadensursache</p><p className="font-medium">{lead.schadensursache || '—'}</p></div>
              <div><p className="text-[10px] text-gray-400 uppercase">Service-Typ</p><p className="font-medium">{lead.service_typ === 'nur_gutachter' ? 'Nur Gutachter' : 'Komplett'}</p></div>
            </div>
            {/* AAR-84: Cardentity-Anreicherung */}
            <div className="pt-3 border-t border-gray-100">
              <CardentityButton
                leadId={lead.id}
                hasFin={!!lead.fin}
                alreadyEnriched={!!lead.cardentity_enriched_at}
              />
            </div>
          </div>

          {/* Versicherung */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <ShieldIcon className="w-4 h-4 text-gray-400" /> Versicherung & Gegner
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><p className="text-[10px] text-gray-400 uppercase">Gegner bekannt</p><p className="font-medium">{lead.gegner_bekannt ? 'Ja' : 'Nein'}</p></div>
              <div><p className="text-[10px] text-gray-400 uppercase">Gegner VS</p><p className="font-medium">{lead.gegner_versicherung || '—'}</p></div>
              <div><p className="text-[10px] text-gray-400 uppercase">Gegner Kennzeichen</p><p className="font-medium">{lead.gegner_kennzeichen || '—'}</p></div>
              <div><p className="text-[10px] text-gray-400 uppercase">Unfall-Konstellation</p><p className="font-medium">{lead.unfall_konstellation || '—'}</p></div>
              <div><p className="text-[10px] text-gray-400 uppercase">Quelle</p><p className="font-medium">{lead.source_channel || '—'}</p></div>
            </div>
          </div>

          {/* Kontakthistorie */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Kontakthistorie</h2>
            </div>
            <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto">
              {(calls ?? []).map((call) => (
                <div key={call.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${call.direction === 'inbound' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'}`}>
                    {call.direction === 'inbound' ? 'Eingehend' : 'Ausgehend'}
                  </span>
                  <span className="text-gray-500">{new Date(call.started_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-gray-400">{call.duration ? `${Math.ceil(call.duration / 60)}min` : '—'}</span>
                  <span className={`text-[10px] ${call.status === 'answered' ? 'text-green-600' : 'text-red-500'}`}>{call.status}</span>
                </div>
              ))}
              {(!calls || calls.length === 0) && (
                <p className="px-5 py-6 text-sm text-gray-400 text-center">Keine Anrufe</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="space-y-4">
          <LeadDetailActions
            leadId={lead.id}
            currentPhase={lead.qualifizierungs_phase}
            serviceTyp={lead.service_typ ?? 'komplett'}
            flowStatus={flowStatus}
            hardGateOk={computeHardGateStatus(lead).allComplete}
          />

          {/* FlowLinks */}
          {flowLinks && flowLinks.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">FlowLinks</h3>
              {flowLinks.map((fl) => (
                <div key={fl.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate max-w-[120px]">{fl.token.slice(0, 8)}...</span>
                  <span className={`font-medium ${fl.status === 'abgeschlossen' ? 'text-green-600' : new Date(fl.expires_at) < new Date() ? 'text-red-500' : 'text-amber-600'}`}>
                    {fl.status === 'abgeschlossen' ? 'Fertig' : new Date(fl.expires_at) < new Date() ? 'Abgelaufen' : 'Offen'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
