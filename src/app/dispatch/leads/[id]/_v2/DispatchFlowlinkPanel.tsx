'use client'

// P2g (dispatch-config-unify): Flowlink-Versand-Panel für den flachen v2-Form.
// Portiert die Versand-Fähigkeit aus Phase5Zusammenfassung (Legacy), entkoppelt
// vom Phasen-Provider — `sendFlowLinkMultiChannel(leadId, kanal)` ist self-contained.
//
// NICHT-blockierend (Spec §6/§8c: „Versand jederzeit"): die Vollständigkeit zeigt
// das DispatchGatesPanel oben; hier nur die Versand-Aktion. Die Server-Action
// validiert kanal-spezifische Pflichtdaten (z.B. WhatsApp braucht SV-Termin) und
// liefert einen klaren Fehler — kein UI-Hard-Gate auf die Qualifizierung.

import { useState, useTransition } from 'react'
import { MessageSquareIcon, PhoneIcon, MailIcon, AlertTriangleIcon, SendIcon } from 'lucide-react'
import { Button } from '@/components/primitives/Button/Button.web'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { sendFlowLinkMultiChannel } from '../_actions/flowlink'

export type DispatchFlowLink = {
  id: string
  token: string
  status: string
  created_at: string
  expires_at: string
  geoeffnet_am: string | null
  abgeschlossen_am: string | null
  fall_id: string | null
}

const FLOWLINK_STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  abgeschlossen: 'success',
  geoeffnet: 'neutral',
  abgelaufen: 'warning',
}

export function DispatchFlowlinkPanel({
  leadId,
  lead,
  flowLinks,
}: {
  leadId: string
  lead: Record<string, unknown>
  flowLinks: DispatchFlowLink[]
}) {
  const telefon = ((lead.telefon as string | null) ?? '').trim()
  const email = ((lead.email as string | null) ?? '').trim()
  const whatsappVerfuegbar = lead.whatsapp_verfuegbar === true
  const [pending, startSend] = useTransition()
  const [status, setStatus] = useState<{ kanal: string; ok: boolean; text: string } | null>(null)

  function send(kanal: 'whatsapp' | 'sms' | 'email') {
    setStatus({ kanal, ok: true, text: 'Sende …' })
    startSend(async () => {
      const r = await sendFlowLinkMultiChannel(leadId, kanal)
      setStatus({
        kanal,
        ok: r.success,
        text: r.success ? 'FlowLink versendet ✓' : r.error ?? 'Versand fehlgeschlagen',
      })
    })
  }

  const latest = flowLinks[0] ?? null
  const latestStatus = latest
    ? latest.abgeschlossen_am
      ? 'abgeschlossen'
      : latest.geoeffnet_am
        ? 'geoeffnet'
        : latest.status
    : null

  return (
    <div className="mt-3 max-w-3xl rounded-ios-xl border border-claimondo-border bg-white p-5 space-y-3">
      <div className="flex items-center gap-2">
        <SendIcon className="h-4 w-4 text-claimondo-ondo" />
        <h3 className="text-sm font-semibold text-claimondo-navy">FlowLink an Kunden versenden</h3>
        {latestStatus && (
          <span className="ml-auto">
            <StatusBadge tone={FLOWLINK_STATUS_TONE[latestStatus] ?? 'neutral'}>
              {latestStatus === 'geoeffnet'
                ? 'geöffnet'
                : latestStatus === 'abgeschlossen'
                  ? 'abgeschlossen'
                  : latestStatus}
            </StatusBadge>
          </span>
        )}
      </div>

      <p className="text-xs text-claimondo-ondo">
        Versand jederzeit möglich (nicht-blockierend). WhatsApp prüft serverseitig, ob SV-Termin +
        Pflichtdaten vorliegen, und meldet konkret was fehlt.
      </p>

      {!telefon && (
        <div className="flex items-start gap-2 rounded-ios-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-800">
            Keine Telefonnummer hinterlegt — kein Versand per WhatsApp/SMS möglich.
          </p>
        </div>
      )}
      {!email && (
        <div className="flex items-start gap-2 rounded-ios-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-800">Keine E-Mail hinterlegt — kein Versand per E-Mail möglich.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          variant={whatsappVerfuegbar ? 'success' : 'ghost'}
          size="md"
          type="button"
          disabled={pending || !telefon}
          onClick={() => send('whatsapp')}
          iconLeft={<MessageSquareIcon className="h-4 w-4" />}
          className="text-sm font-semibold"
        >
          {pending && status?.kanal === 'whatsapp' ? 'Sende …' : 'WhatsApp'}
        </Button>
        <Button
          variant="ghost"
          size="md"
          type="button"
          disabled={pending || !telefon}
          onClick={() => send('sms')}
          iconLeft={<PhoneIcon className="h-4 w-4" />}
          className="text-sm font-semibold"
        >
          {pending && status?.kanal === 'sms' ? 'Sende …' : 'SMS'}
        </Button>
        <Button
          variant="ondo"
          size="md"
          type="button"
          disabled={pending || !email}
          onClick={() => send('email')}
          iconLeft={<MailIcon className="h-4 w-4" />}
          className="text-sm font-semibold"
        >
          {pending && status?.kanal === 'email' ? 'Sende …' : 'E-Mail'}
        </Button>
      </div>

      {status && (
        <div
          className={`rounded-ios-lg px-3 py-2 text-xs ${
            status.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {status.kanal}: {status.text}
        </div>
      )}

      {latest && (
        <p className="text-[11px] text-claimondo-ondo/70">
          Letzter FlowLink vom {new Date(latest.created_at).toLocaleString('de-DE')} ·{' '}
          <a
            href={`/flow/${latest.token}`}
            target="_blank"
            rel="noopener"
            className="text-claimondo-ondo underline hover:text-claimondo-navy"
          >
            Portal öffnen
          </a>
          {latest.fall_id && <span className="ml-1 text-emerald-600">· zu Fall konvertiert</span>}
        </p>
      )}
    </div>
  )
}
