'use client'

// P2h (dispatch-config-unify): Status-Tracking-Panel für den flachen v2-Form.
// Portiert aus Phase6StatusTracking, entkoppelt vom Phasen-Provider — liest
// `lead` + `flowLinks` (beide schon im DispatchLeadForm vorhanden); SA/Vollmacht
// stehen auf dem Lead. Der Re-Send ist NICHT dupliziert — das DispatchFlowlinkPanel
// darüber sendet (auch erneut). Cutover-Parität 2/3.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2Icon,
  CircleIcon,
  ClockIcon,
  EyeIcon,
  FileSignatureIcon,
  ScaleIcon,
  AlertTriangleIcon,
  MinusCircleIcon,
  RefreshCwIcon,
} from 'lucide-react'
import PhoneButton from '@/components/shared/PhoneButton'
import type { DispatchFlowLink } from './DispatchFlowlinkPanel'

type StepState = 'pending' | 'done' | 'warning' | 'disabled'
type Step = { label: string; sub?: string; state: StepState; icon: React.ReactNode }

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
}

export function DispatchStatusPanel({
  leadId,
  lead,
  flowLinks,
}: {
  leadId: string
  lead: Record<string, unknown>
  flowLinks: DispatchFlowLink[]
}) {
  const router = useRouter()
  const isPfadB = lead.service_typ === 'nur_gutachter'
  const telefon = (lead.telefon as string | null) ?? null
  const vorname = (lead.vorname as string | null) ?? ''
  const nachname = (lead.nachname as string | null) ?? ''
  const waGesendet = lead.wa_gesendet === true
  const saUnterschrieben = lead.sa_unterschrieben === true
  const vollmachtSigniertAm = (lead.vollmacht_signiert_am as string | null) ?? null
  const latestFlow = flowLinks[0] ?? null

  // Inaktiv-Alarm (>2h gesendet, nicht geöffnet) erst client-seitig berechnen,
  // damit Date.now() keinen SSR/Client-Hydration-Mismatch erzeugt.
  const [alarm, setAlarm] = useState(false)
  useEffect(() => {
    if (!latestFlow || latestFlow.geoeffnet_am || latestFlow.abgeschlossen_am || latestFlow.status === 'abgeschlossen') {
      setAlarm(false)
      return
    }
    setAlarm(Date.now() - new Date(latestFlow.created_at).getTime() > 2 * 60 * 60 * 1000)
  }, [latestFlow])

  // Auto-Refresh alle 30s solange SA aussteht + ein FlowLink existiert.
  useEffect(() => {
    if (saUnterschrieben || !latestFlow) return
    const iv = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(iv)
  }, [saUnterschrieben, latestFlow, router])

  const stepSent: Step = {
    label: 'Token-Link gesendet',
    sub: latestFlow ? `Erstellt ${fmtDate(latestFlow.created_at)}` : 'Noch nicht gesendet',
    state: latestFlow ? 'done' : 'pending',
    icon: <ClockIcon className="w-4 h-4" />,
  }
  const stepDelivered: Step = {
    label: waGesendet ? 'Link angekommen' : 'Versand abgeschickt',
    sub: waGesendet ? 'Twilio Delivery-Bestätigung' : 'Versand abgeschickt — kein Delivery-Callback bei E-Mail/SMS',
    state: latestFlow ? (waGesendet ? 'done' : 'pending') : 'pending',
    icon: <CheckCircle2Icon className="w-4 h-4" />,
  }
  const stepOpened: Step = {
    label: 'Link geöffnet',
    sub: latestFlow?.geoeffnet_am
      ? `Geöffnet ${fmtDate(latestFlow.geoeffnet_am)}`
      : alarm
        ? 'Inaktiv seit >2h'
        : 'Kunde hat noch nicht geöffnet',
    state: latestFlow?.geoeffnet_am ? 'done' : alarm ? 'warning' : 'pending',
    icon: <EyeIcon className="w-4 h-4" />,
  }
  const stepSa: Step = {
    label: 'SA unterschrieben',
    sub: saUnterschrieben ? 'Sachverständigen-Auftrag digital unterschrieben' : 'Noch offen',
    state: saUnterschrieben ? 'done' : 'pending',
    icon: <FileSignatureIcon className="w-4 h-4" />,
  }
  const stepVollmacht: Step = {
    label: 'Vollmacht unterschrieben',
    sub: isPfadB
      ? 'Nicht relevant bei Pfad B — Kunde hat keine Kanzlei-Vollmacht'
      : vollmachtSigniertAm
        ? 'LexDrive-Vollmacht erteilt'
        : 'LexDrive WhatsApp-Bot sendet Vollmacht',
    state: isPfadB ? 'disabled' : vollmachtSigniertAm ? 'done' : 'pending',
    icon: isPfadB ? <MinusCircleIcon className="w-4 h-4" /> : <ScaleIcon className="w-4 h-4" />,
  }
  const steps: Step[] = [stepSent, stepDelivered, stepOpened, stepSa, stepVollmacht]

  return (
    <div className="mt-3 max-w-3xl space-y-3">
      {alarm && (
        <div className="rounded-ios-xl border border-danger/30 bg-danger-soft p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="w-4 h-4 text-danger" />
            <p className="text-sm font-semibold text-danger-strong">Inaktiv seit 2h+</p>
          </div>
          <p className="text-xs text-danger">
            Token-Link noch nicht geöffnet — Kunde {vorname} {nachname} jetzt anrufen.
          </p>
          {telefon && (
            <div className="flex items-center gap-2 pt-1">
              <PhoneButton nummer={telefon} variant="inline" className="text-xs text-danger-strong underline" />
              <PhoneButton nummer={telefon} mode="aircall" variant="iconOnly" leadId={leadId} />
            </div>
          )}
        </div>
      )}

      <div className="rounded-ios-xl border border-claimondo-border bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2Icon className="w-4 h-4 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">Status-Tracking</h2>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="ml-auto flex items-center gap-1 text-[10px] text-claimondo-ondo/70 hover:text-claimondo-ondo"
            title="Status neu laden (Auto-Refresh alle 30s)"
          >
            <RefreshCwIcon className="w-3 h-3" />
            Aktualisieren
          </button>
          <span className="text-[10px] text-claimondo-ondo/70">{isPfadB ? 'Pfad B — Nur SV' : 'Pfad A — Komplett'}</span>
        </div>
        <ol className="relative ml-2 space-y-5 border-l border-claimondo-border">
          {steps.map((s, i) => (
            <li key={i} className="pl-6">
              <span
                className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${
                  s.state === 'done'
                    ? 'bg-success text-white'
                    : s.state === 'warning'
                      ? 'bg-danger text-white'
                      : s.state === 'disabled'
                        ? 'bg-claimondo-bg text-claimondo-ondo/50'
                        : 'bg-claimondo-border text-claimondo-ondo/70'
                }`}
              >
                {s.state === 'done' ? <CheckCircle2Icon className="w-3.5 h-3.5" /> : s.icon}
              </span>
              <p
                className={`text-sm font-medium ${
                  s.state === 'warning'
                    ? 'text-danger-strong'
                    : s.state === 'disabled'
                      ? 'text-claimondo-ondo/70'
                      : 'text-claimondo-navy'
                }`}
              >
                {s.label}
              </p>
              {s.sub && (
                <p className={`mt-0.5 text-[11px] ${s.state === 'disabled' ? 'italic text-claimondo-ondo/70' : 'text-claimondo-ondo'}`}>
                  {s.sub}
                </p>
              )}
            </li>
          ))}
          {!latestFlow && (
            <li className="mt-1 border-t border-dashed border-claimondo-border pl-6 pt-3">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-claimondo-border text-claimondo-ondo/70 ring-4 ring-white">
                <CircleIcon className="w-3.5 h-3.5" />
              </span>
              <p className="text-sm text-claimondo-ondo">Noch kein FlowLink versendet — oben im Versand-Panel senden.</p>
            </li>
          )}
        </ol>
      </div>
    </div>
  )
}
