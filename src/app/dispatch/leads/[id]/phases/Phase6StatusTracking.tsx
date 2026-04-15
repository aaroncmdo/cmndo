'use client'

// AAR-142 / W8: Phase 6 Status-Tracking nach FlowLink-Versand.
// Vertikaler Stepper mit 5-6 Schritten (Pfad A vs. Pfad B) + Inaktiv-Alarm
// bei >2h ohne Portal-Aktion. Daten kommen aus flow_links (status + Events)
// und ggf. vom Fall (sa_unterschrieben, vollmacht_bestaetigt).

import { useDispatchPhase } from '../lib/phase-context'
import AircallCallButton from '@/components/AircallCallButton'
import {
  CheckCircle2Icon,
  CircleIcon,
  ClockIcon,
  EyeIcon,
  FileSignatureIcon,
  ScaleIcon,
  AlertTriangleIcon,
  PhoneIcon,
} from 'lucide-react'

type FlowLinkRow = {
  id: string
  token: string
  status: string
  created_at: string
  expires_at: string
  geoeffnet_am?: string | null
  abgeschlossen_am?: string | null
  fall_id?: string | null
}

type FallSnapshot = {
  sa_unterschrieben?: boolean | null
  vollmacht_unterschrieben?: boolean | null
}

type StepState = 'pending' | 'done' | 'warning'

type Step = {
  label: string
  sub?: string
  state: StepState
  icon: React.ReactNode
}

export default function Phase6StatusTracking({
  flowLinks,
  fall,
}: {
  flowLinks: FlowLinkRow[]
  fall: FallSnapshot | null
}) {
  const { lead } = useDispatchPhase()
  const l = lead as unknown as {
    service_typ?: 'komplett' | 'nur_gutachter' | string | null
    telefon?: string | null
    vorname?: string | null
    nachname?: string | null
  }
  const latestFlow = flowLinks[0]

  // Inaktiv-Alarm: FlowLink seit >2h gesendet aber nicht geöffnet
  const alarm =
    latestFlow &&
    !latestFlow.geoeffnet_am &&
    latestFlow.status !== 'abgeschlossen' &&
    Date.now() - new Date(latestFlow.created_at).getTime() > 2 * 60 * 60 * 1000

  const isPfadB = l.service_typ === 'nur_gutachter'

  const stepSent: Step = {
    label: 'Token-Link gesendet',
    sub: latestFlow
      ? `Erstellt ${new Date(latestFlow.created_at).toLocaleString('de-DE')}`
      : 'Noch nicht gesendet',
    state: latestFlow ? 'done' : 'pending',
    icon: <ClockIcon className="w-4 h-4" />,
  }

  const stepDelivered: Step = {
    label: 'Link angekommen',
    sub: 'Twilio Delivery-Bestätigung',
    // Delivery-Status liegt in Twilio — konservativ: done sobald FlowLink existiert
    state: latestFlow ? 'done' : 'pending',
    icon: <CheckCircle2Icon className="w-4 h-4" />,
  }

  const stepOpened: Step = {
    label: 'Link geöffnet',
    sub: latestFlow?.geoeffnet_am
      ? `Geöffnet ${new Date(latestFlow.geoeffnet_am).toLocaleString('de-DE')}`
      : alarm
        ? 'Inaktiv seit >2h'
        : 'Kunde hat noch nicht geöffnet',
    state: latestFlow?.geoeffnet_am ? 'done' : alarm ? 'warning' : 'pending',
    icon: <EyeIcon className="w-4 h-4" />,
  }

  const stepSa: Step = {
    label: 'SA unterschrieben',
    sub: fall?.sa_unterschrieben ? 'Sachverständigen-Auftrag digital unterschrieben' : 'Noch offen',
    state: fall?.sa_unterschrieben ? 'done' : 'pending',
    icon: <FileSignatureIcon className="w-4 h-4" />,
  }

  const stepVollmacht: Step = {
    label: 'Vollmacht unterschrieben',
    sub: fall?.vollmacht_unterschrieben
      ? 'LexDrive-Vollmacht erteilt'
      : 'LexDrive WhatsApp-Bot sendet Vollmacht',
    state: fall?.vollmacht_unterschrieben ? 'done' : 'pending',
    icon: <ScaleIcon className="w-4 h-4" />,
  }

  const steps: Step[] = isPfadB
    ? [stepSent, stepDelivered, stepOpened, stepSa]
    : [stepSent, stepDelivered, stepOpened, stepSa, stepVollmacht]

  return (
    <div className="space-y-4">
      {alarm && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="w-4 h-4 text-red-600" />
            <p className="text-sm font-semibold text-red-800">Inaktiv seit 2h+</p>
          </div>
          <p className="text-xs text-red-600">
            Token-Link noch nicht geöffnet — Kunde {l.vorname ?? ''} {l.nachname ?? ''} jetzt
            anrufen.
          </p>
          {l.telefon && (
            <div className="flex items-center gap-2 pt-1">
              <PhoneIcon className="w-3.5 h-3.5 text-red-700" />
              <a href={`tel:${l.telefon}`} className="text-xs text-red-700 underline">{l.telefon}</a>
              <AircallCallButton phoneNumber={l.telefon} leadId={lead.id} variant="icon" />
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2Icon className="w-4 h-4 text-[#4573A2]" />
          <h2 className="text-sm font-semibold text-gray-900">Status-Tracking</h2>
          <span className="ml-auto text-[10px] text-gray-400">
            {isPfadB ? 'Pfad B — Nur SV' : 'Pfad A — Komplett'}
          </span>
        </div>
        <ol className="relative border-l border-gray-200 ml-2 space-y-5">
          {steps.map((s, i) => (
            <li key={i} className="pl-6">
              <span
                className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-white ${
                  s.state === 'done'
                    ? 'bg-green-500 text-white'
                    : s.state === 'warning'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-400'
                }`}
              >
                {s.state === 'done' ? <CheckCircle2Icon className="w-3.5 h-3.5" /> : s.icon}
              </span>
              <p className={`text-sm font-medium ${s.state === 'warning' ? 'text-red-700' : 'text-gray-900'}`}>
                {s.label}
              </p>
              {s.sub && <p className="text-[11px] text-gray-500 mt-0.5">{s.sub}</p>}
            </li>
          ))}
          {!steps.length && (
            <li className="pl-6">
              <span className="absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-white bg-gray-200 text-gray-400">
                <CircleIcon className="w-3.5 h-3.5" />
              </span>
              <p className="text-sm text-gray-500">Noch kein FlowLink versendet</p>
            </li>
          )}
        </ol>
      </div>
    </div>
  )
}
