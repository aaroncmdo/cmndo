'use client'

// AAR-137 / W3: Phase-Stubs für die neue DispatchShell.
// Jede Phase-Stub wrappt die existierenden Components, sodass die Dispatch-Seite
// während der W4-W7-Migration voll funktionsfähig bleibt. W4-W7 ersetzen dann
// jede Stub-Component durch eine eigenständige Phase-Implementation gemäß
// Notion-Master-Spec 14.04.2026.

import Phase1Qualifizierung from './Phase1Qualifizierung'
import Phase2TerminServiceTypComponent from './Phase2TerminServiceTyp'
import Phase3SchadentypComponent from './Phase3Schadentyp'
import CardentityButton from '../CardentityButton'
import LeadDetailActions from '../LeadDetailActions'
import ExitSkript, { type DisqualifikationsGrund } from '../ExitSkript'
import { useDispatchPhase } from '../lib/phase-context'
import { PhoneIcon, MailIcon, CarIcon, ShieldIcon } from 'lucide-react'
import AircallCallButton from '@/components/AircallCallButton'
import { computeFlowLinkStufe, FLOWLINK_STUFE_LABEL } from '@/lib/dispatch/fahrzeug-marken'

type FlowLinkRow = {
  id: string
  token: string
  status: string
  created_at: string
  expires_at: string
}

type CallRow = {
  id: string
  direction: string
  started_at: string
  duration: number | null
  status: string | null
}

type PhaseProps = {
  flowLinks: FlowLinkRow[]
  calls: CallRow[]
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
      {children}
    </div>
  )
}

function DisqualifiziertOverlay() {
  const { lead } = useDispatchPhase()
  const grund = (lead as { disqualifikations_grund_key?: string | null })
    .disqualifikations_grund_key as DisqualifikationsGrund | null
  if (!grund) return null
  return <ExitSkript grund={grund} />
}

/** Phase 1 — Qualifizierung. W4 (AAR-138) hat den Hard Gate zu Phase1Qualifizierung refactort. */
export function Phase1() {
  const { qualification } = useDispatchPhase()
  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />
  return <Phase1Qualifizierung />
}

/** Phase 2 — SV-Termin + Service-Typ (Pfad A/B). W5 (AAR-139). */
export function Phase2TerminServiceTyp() {
  const { qualification } = useDispatchPhase()
  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />
  return <Phase2TerminServiceTypComponent />
}

/** Phase 3 — Schadentyp (Wrapper um SchadentypPicker). W5 (AAR-139). */
export function Phase3Schadentyp() {
  const { qualification } = useDispatchPhase()
  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />
  return <Phase3SchadentypComponent />
}

/** Phase 4 — Stammdaten (Kontakt, Fahrzeug, Versicherung, Gegner). W6 baut echte Form. */
export function Phase4Stammdaten() {
  const { lead, qualification } = useDispatchPhase()
  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />
  const l = lead as unknown as Record<string, string | boolean | null | undefined>
  return (
    <div className="space-y-4">
      <Card title="Kontaktdaten">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <PhoneIcon className="w-4 h-4 text-gray-400" />
            {l.telefon ? (
              <>
                <a href={`tel:${l.telefon}`} className="text-[#4573A2] hover:underline">
                  {l.telefon as string}
                </a>
                <AircallCallButton phoneNumber={l.telefon as string} leadId={lead.id} variant="icon" />
              </>
            ) : <span className="text-gray-400">—</span>}
          </div>
          <div className="flex items-center gap-2">
            <MailIcon className="w-4 h-4 text-gray-400" />
            {l.email ? (
              <a href={`mailto:${l.email}`} className="text-[#4573A2] hover:underline">
                {l.email as string}
              </a>
            ) : <span className="text-gray-400">—</span>}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <CarIcon className="w-4 h-4 text-gray-400" /> Fahrzeug & Schaden
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div><p className="text-[10px] text-gray-400 uppercase">Kennzeichen</p><p className="font-medium">{(l.kennzeichen as string) || '—'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase">Hersteller</p><p className="font-medium">{(l.fahrzeug_hersteller as string) || '—'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase">Modell</p><p className="font-medium">{(l.fahrzeug_modell as string) || '—'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase">Schadenfall</p><p className="font-medium">{(l.schadenfall_typ as string) || '—'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase">Schadensursache</p><p className="font-medium">{(l.schadensursache as string) || '—'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase">Service-Typ</p><p className="font-medium">{l.service_typ === 'nur_gutachter' ? 'Nur Gutachter' : 'Komplett'}</p></div>
        </div>
        <div className="pt-3 border-t border-gray-100">
          <CardentityButton
            leadId={lead.id}
            hasFin={!!l.fin}
            alreadyEnriched={!!l.cardentity_enriched_at}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <ShieldIcon className="w-4 h-4 text-gray-400" /> Versicherung & Gegner
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div><p className="text-[10px] text-gray-400 uppercase">Gegner bekannt</p><p className="font-medium">{l.gegner_bekannt ? 'Ja' : 'Nein'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase">Gegner VS</p><p className="font-medium">{(l.gegner_versicherung as string) || '—'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase">Gegner Kennzeichen</p><p className="font-medium">{(l.gegner_kennzeichen as string) || '—'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase">Unfall-Konstellation</p><p className="font-medium">{(l.unfall_konstellation as string) || '—'}</p></div>
          <div><p className="text-[10px] text-gray-400 uppercase">Quelle</p><p className="font-medium">{(l.source_channel as string) || '—'}</p></div>
        </div>
      </Card>
    </div>
  )
}

/** Phase 5 — Zusammenfassung + FlowLink versenden. W7 baut Zusammenfassungs-Panel. */
export function Phase5Zusammenfassung({ flowLinks, calls }: PhaseProps) {
  const { lead, aktiverTermin, qualification } = useDispatchPhase()
  if (qualification.disqualifiziert) return <DisqualifiziertOverlay />

  const latestFlow = flowLinks[0]
  const flowStufe = computeFlowLinkStufe(lead as Parameters<typeof computeFlowLinkStufe>[0], latestFlow)
  const flowStufeBadge = FLOWLINK_STUFE_LABEL[flowStufe]
  let flowStatus: 'none' | 'offen' | 'abgeschlossen' | 'abgelaufen' = 'none'
  if (flowStufe === 'abgeschlossen') flowStatus = 'abgeschlossen'
  else if (flowStufe === 'abgelaufen') flowStatus = 'abgelaufen'
  else if (flowStufe !== 'nicht_gesendet') flowStatus = 'offen'

  return (
    <div className="space-y-4">
      <Card title="Zusammenfassung">
        <p className="text-xs text-gray-500">
          {qualification.completedCount} / 6 Bedingungen erfüllt — FlowLink-Versand {qualification.canSendFlowLink ? 'möglich' : 'noch blockiert'}.
        </p>
        <p className="text-xs text-gray-400 italic">W7 baut hier die vollständige Zusammenfassung (AAR-141).</p>
        <div className="pt-2">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${flowStufeBadge.cls}`}>
            {flowStufeBadge.label}
          </span>
        </div>
      </Card>

      <LeadDetailActions
        leadId={lead.id}
        currentPhase={(lead as { qualifizierungs_phase?: string }).qualifizierungs_phase ?? 'neu'}
        serviceTyp={(lead as { service_typ?: string }).service_typ ?? 'komplett'}
        flowStatus={flowStatus}
        hardGateOk={qualification.allComplete}
        hasSvTermin={aktiverTermin?.status === 'reserviert' || aktiverTermin?.status === 'bestaetigt'}
      />

      {flowLinks.length > 0 && (
        <Card title="FlowLinks">
          <div className="space-y-2">
            {flowLinks.map((fl) => (
              <div key={fl.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 truncate max-w-[120px]">{fl.token.slice(0, 8)}...</span>
                <span className={`font-medium ${fl.status === 'abgeschlossen' ? 'text-green-600' : new Date(fl.expires_at) < new Date() ? 'text-red-500' : 'text-amber-600'}`}>
                  {fl.status === 'abgeschlossen' ? 'Fertig' : new Date(fl.expires_at) < new Date() ? 'Abgelaufen' : 'Offen'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Kontakthistorie">
        <div className="max-h-[300px] overflow-y-auto -mx-5">
          {calls.length === 0 && (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">Keine Anrufe</p>
          )}
          {calls.map((call) => (
            <div key={call.id} className="px-5 py-2 flex items-center gap-3 text-sm border-b border-gray-50 last:border-0">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${call.direction === 'inbound' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'}`}>
                {call.direction === 'inbound' ? 'Eingehend' : 'Ausgehend'}
              </span>
              <span className="text-gray-500">{new Date(call.started_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="text-gray-400">{call.duration ? `${Math.ceil(call.duration / 60)}min` : '—'}</span>
              <span className={`text-[10px] ${call.status === 'answered' ? 'text-green-600' : 'text-red-500'}`}>{call.status ?? '—'}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/** Phase 6 — Status-Tracking nach FlowLink. W8 baut AAR-142. */
export function Phase6StatusTracking() {
  return (
    <Card title="Phase 6 — Status-Tracking">
      <p className="text-xs text-gray-500">
        Diese Phase zeigt den Status nach FlowLink-Versand: FlowLink abgeschlossen, SA
        versendet, SA unterschrieben, Konvertiert. Implementierung folgt in W8 (AAR-142).
      </p>
    </Card>
  )
}
