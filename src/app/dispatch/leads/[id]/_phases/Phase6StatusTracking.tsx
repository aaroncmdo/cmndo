'use client'

// AAR-142 / W8: Phase 6 Status-Tracking nach FlowLink-Versand.
// AAR-178 P3-C + P3-E: Erneut-senden Button + Vollmacht immer als 5. Schritt
// sichtbar (grayed-out für Pfad B damit der MA die komplette Reihenfolge sieht).

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDispatchPhase } from '../_lib/phase-context'
import { sendFlowLinkMultiChannel } from '../actions'
import PhoneButton from '@/components/shared/PhoneButton'
import {
  CheckCircle2Icon,
  CircleIcon,
  ClockIcon,
  EyeIcon,
  FileSignatureIcon,
  ScaleIcon,
  AlertTriangleIcon,
  PhoneIcon,
  SendIcon,
  MinusCircleIcon,
  MailIcon,
  RefreshCwIcon,
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
  // AAR-583 (N6): bool → timestamptz, Semantik via IS NOT NULL.
  vollmacht_signiert_am?: string | null
}

type StepState = 'pending' | 'done' | 'warning' | 'disabled'

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
  const router = useRouter()
  const { lead } = useDispatchPhase()
  const l = lead as unknown as {
    service_typ?: 'komplett' | 'nur_gutachter' | string | null
    telefon?: string | null
    email?: string | null
    vorname?: string | null
    nachname?: string | null
    // AAR-275: wa_gesendet verrät ob letzter Versand WA war (Twilio-Delivery
    // möglich) oder Email/SMS (kein WA-Callback).
    wa_gesendet?: boolean | null
    whatsapp_verfuegbar?: boolean | null
  }
  const latestFlow = flowLinks[0]

  // Inaktiv-Alarm: FlowLink seit >2h gesendet aber nicht geöffnet
  const alarm =
    latestFlow &&
    !latestFlow.geoeffnet_am &&
    latestFlow.status !== 'abgeschlossen' &&
    Date.now() - new Date(latestFlow.created_at).getTime() > 2 * 60 * 60 * 1000

  const isPfadB = l.service_typ === 'nur_gutachter'

  // Beide Steps teilen den State „gibt es einen FlowLink?" — stepDelivered
  // spreadet stepSent damit die Logik nicht parallel gepflegt werden muss
  // (Redundanz-Fix). Twilio liefert den echten Delivery-Status asynchron —
  // hier konservativ: sobald der Link erstellt ist, gilt er als zugestellt.
  const stepSent: Step = {
    label: 'Token-Link gesendet',
    sub: latestFlow
      ? `Erstellt ${new Date(latestFlow.created_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`
      : 'Noch nicht gesendet',
    state: latestFlow ? 'done' : 'pending',
    icon: <ClockIcon className="w-4 h-4" />,
  }

  // AAR-275: Twilio-Delivery-Sub nur bei WA-Versand sinnvoll. Email/SMS
  // haben keinen verlässlichen Delivery-Callback im Webhook — bei Email
  // gilt „abgeschickt = angekommen" als Best-Guess, kein grünes Häkchen.
  const versandweg: 'whatsapp' | 'andere' = l.wa_gesendet === true ? 'whatsapp' : 'andere'
  const deliverySub =
    versandweg === 'whatsapp'
      ? 'Twilio Delivery-Bestätigung'
      : 'Versand abgeschickt — kein Delivery-Callback bei Email/SMS'
  const stepDelivered: Step = {
    ...stepSent,
    label: versandweg === 'whatsapp' ? 'Link angekommen' : 'Versand abgeschickt',
    sub: deliverySub,
    state: latestFlow ? (versandweg === 'whatsapp' ? 'done' : 'pending') : 'pending',
    icon: <CheckCircle2Icon className="w-4 h-4" />,
  }

  const stepOpened: Step = {
    label: 'Link geöffnet',
    sub: latestFlow?.geoeffnet_am
      ? `Geöffnet ${new Date(latestFlow.geoeffnet_am).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`
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

  // AAR-178 P3-E: Vollmacht immer als 5. Schritt sichtbar, für Pfad B
  // grayed-out („nicht relevant") statt ganz versteckt — MA soll die ganze
  // Reihenfolge sehen können.
  const stepVollmacht: Step = {
    label: 'Vollmacht unterschrieben',
    sub: isPfadB
      ? 'Nicht relevant bei Pfad B — Kunde hat keine Kanzlei-Vollmacht'
      : fall?.vollmacht_signiert_am
        ? 'LexDrive-Vollmacht erteilt'
        : 'LexDrive WhatsApp-Bot sendet Vollmacht',
    state: isPfadB
      ? 'disabled'
      : fall?.vollmacht_signiert_am ? 'done' : 'pending',
    icon: isPfadB ? <MinusCircleIcon className="w-4 h-4" /> : <ScaleIcon className="w-4 h-4" />,
  }

  const steps: Step[] = [stepSent, stepDelivered, stepOpened, stepSa, stepVollmacht]

  // AAR-201: Auto-Refresh alle 30s solange SA noch aussteht + FlowLink da ist.
  // Stop-Bedingungen:
  //   - SA unterschrieben → Fall ist erstellt, weitere Updates kommen aus
  //     Fallakte/Phase 6 rendert als archiviert
  //   - Kein FlowLink → Empty-State, nichts zum Refreshen
  useEffect(() => {
    if (fall?.sa_unterschrieben) return
    if (!latestFlow) return
    const interval = setInterval(() => {
      router.refresh()
    }, 30_000)
    return () => clearInterval(interval)
  }, [fall?.sa_unterschrieben, latestFlow, router])

  // AAR-178 P3-C + AAR-200: Erneut-senden Button — falls der Kunde den
  // Link verloren hat oder der Alarm anschlägt, kann der MA aus Phase 6
  // direkt re-triggern ohne zurück zu Phase 5 springen zu müssen.
  // AAR-200: SMS + Email als Alternative zu WhatsApp — wenn der Kunde
  // kein WA hat (Status-Callback hat bevorzugter_kanal auf 'sms' gesetzt
  // → MA wählt jetzt direkt den richtigen Kanal).
  const [resendPending, startResend] = useTransition()
  const [resendStatus, setResendStatus] = useState<{ ok: boolean; text: string } | null>(null)
  function resend(kanal: 'whatsapp' | 'sms' | 'email') {
    if ((kanal === 'whatsapp' || kanal === 'sms') && !l.telefon) {
      setResendStatus({ ok: false, text: 'Keine Telefonnummer am Lead' })
      return
    }
    if (kanal === 'email' && !l.email) {
      setResendStatus({ ok: false, text: 'Keine Email-Adresse am Lead' })
      return
    }
    startResend(async () => {
      try {
        const r = await sendFlowLinkMultiChannel(lead.id, kanal, null)
        const label = kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'
        setResendStatus({
          ok: r.success,
          text: r.success ? `FlowLink erneut per ${label} gesendet` : r.error ?? 'Versand fehlgeschlagen',
        })
      } catch (err) {
        setResendStatus({
          ok: false,
          text: err instanceof Error ? err.message : 'Versand fehlgeschlagen',
        })
      }
    })
  }

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
              <PhoneButton nummer={l.telefon} variant="inline" className="text-xs text-red-700 underline" />
              <PhoneButton nummer={l.telefon} mode="aircall" variant="iconOnly" leadId={lead.id} />
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-claimondo-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2Icon className="w-4 h-4 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">Status-Tracking</h2>
          {/* AAR-201: Auto-Refresh läuft alle 30s im Hintergrund. Manueller
              Button für Dispatcher der sofort sehen will ob Kunde gerade
              geöffnet hat. */}
          <button
            type="button"
            onClick={() => router.refresh()}
            className="ml-auto text-[10px] text-claimondo-ondo/70 hover:text-claimondo-ondo flex items-center gap-1"
            title="Status neu laden (Auto-Refresh alle 30s)"
          >
            <RefreshCwIcon className="w-3 h-3" />
            Aktualisieren
          </button>
          <span className="text-[10px] text-claimondo-ondo/70">
            {isPfadB ? 'Pfad B — Nur SV' : 'Pfad A — Komplett'}
          </span>
        </div>
        <ol className="relative border-l border-claimondo-border ml-2 space-y-5">
          {steps.map((s, i) => (
            <li key={i} className="pl-6">
              <span
                className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-white ${
                  s.state === 'done'
                    ? 'bg-green-500 text-white'
                    : s.state === 'warning'
                      ? 'bg-red-500 text-white'
                      : s.state === 'disabled'
                        ? 'bg-claimondo-bg text-claimondo-ondo/50'
                        : 'bg-claimondo-border text-claimondo-ondo/70'
                }`}
              >
                {s.state === 'done' ? <CheckCircle2Icon className="w-3.5 h-3.5" /> : s.icon}
              </span>
              <p className={`text-sm font-medium ${
                s.state === 'warning' ? 'text-red-700'
                : s.state === 'disabled' ? 'text-claimondo-ondo/70'
                : 'text-claimondo-navy'
              }`}>
                {s.label}
              </p>
              {s.sub && <p className={`text-[11px] mt-0.5 ${s.state === 'disabled' ? 'text-claimondo-ondo/70 italic' : 'text-claimondo-ondo'}`}>{s.sub}</p>}
            </li>
          ))}
          {/* AAR-179 Audit-Fix #2: steps hat jetzt immer 5 Einträge (Vollmacht
              immer sichtbar). Empty-State triggert jetzt wenn kein FlowLink
              existiert — nicht mehr an steps.length gekoppelt (unreachable).
              Der Stepper rendert weiter als visuelle Roadmap, die Empty-Zeile
              darunter macht den Zustand explizit. */}
          {!latestFlow && (
            <li className="pl-6 pt-3 mt-1 border-t border-dashed border-claimondo-border">
              <span className="absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-white bg-claimondo-border text-claimondo-ondo/70">
                <CircleIcon className="w-3.5 h-3.5" />
              </span>
              <p className="text-sm text-claimondo-ondo">Noch kein FlowLink versendet — zurück zu Phase 5</p>
            </li>
          )}
        </ol>

        {/* AAR-178 P3-C + AAR-200: FlowLink erneut senden — 3 Kanäle
            (WhatsApp / SMS / Email) damit der MA auch nach Phase-6-Öffnung
            noch den passenden Kanal wählen kann. */}
        {latestFlow && (
          <div className="mt-5 pt-4 border-t border-claimondo-border space-y-2">
            <p className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider">
              FlowLink erneut senden
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => resend('whatsapp')}
                disabled={resendPending || !l.telefon}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                  l.whatsapp_verfuegbar === true
                    ? 'bg-[#25D366] text-white hover:bg-[#1fa855] ring-2 ring-emerald-300'
                    : 'bg-[#25D366] text-white hover:bg-[#1fa855]'
                }`}
              >
                <SendIcon className="w-3.5 h-3.5" />
                {l.whatsapp_verfuegbar === true ? '📱 WA' : 'WhatsApp'}
              </button>
              <button
                type="button"
                onClick={() => resend('sms')}
                disabled={resendPending || !l.telefon}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                  l.whatsapp_verfuegbar === true
                    ? 'bg-claimondo-bg text-claimondo-ondo/60 border border-claimondo-border hover:bg-claimondo-border'
                    : 'bg-amber-500 text-white hover:bg-amber-600'
                }`}
              >
                <PhoneIcon className="w-3.5 h-3.5" />
                SMS
              </button>
              <button
                type="button"
                onClick={() => resend('email')}
                disabled={resendPending || !l.email}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-claimondo-ondo text-white text-xs font-semibold hover:bg-[#3a6290] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <MailIcon className="w-3.5 h-3.5" />
                Email
              </button>
            </div>
            {!l.telefon && !l.email && (
              <p className="text-[10px] text-claimondo-ondo/70">
                Weder Telefon noch Email am Lead — erst in Phase 5 hinterlegen.
              </p>
            )}
            {resendStatus && (
              <p className={`text-[11px] ${resendStatus.ok ? 'text-green-700' : 'text-red-600'}`}>
                {resendPending ? 'Sende ...' : resendStatus.text}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
