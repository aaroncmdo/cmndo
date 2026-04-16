'use client'

// AAR-263: Polizeibericht-Upload-Karte in Phase 4 (1:1 Pattern wie ZB1).
// „Polizeiliche Unfallmitteilung zur Hand?" Toggle. Bei JA: Kanal wählen
// (WA/SMS/Email) und Anfrage an Kunden versenden. Bei NEIN: status='abgelehnt'
// → Pflichtdokument im FlowLink. Nur sichtbar wenn polizei_vor_ort=true UND
// polizeibericht_pflicht=true.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { triggerPolizeiberichtUploadRequest, saveStammdaten } from '../actions'
import {
  ShieldAlertIcon, MessageSquareIcon, PhoneIcon, MailIcon,
  CheckCircle2Icon, ClockIcon, AlertCircleIcon, XCircleIcon,
} from 'lucide-react'

type Props = {
  leadId: string
  polizeiberichtStatus: string | null
  polizeiberichtHochgeladenAm: string | null
  telefon: string | null
  email: string | null
}

const STATUS_UI: Record<string, { label: string; bg: string; text: string; icon: typeof CheckCircle2Icon }> = {
  gesendet: { label: 'Anfrage gesendet — warte auf Foto', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: ClockIcon },
  geoeffnet: { label: 'Kunde hat Anfrage geöffnet', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: ClockIcon },
  hochgeladen: { label: 'Polizeibericht eingegangen', bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle2Icon },
  fehlgeschlagen: { label: 'Upload fehlgeschlagen — manuell anfordern', bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: AlertCircleIcon },
  abgelehnt: { label: 'Manuelle Anforderung später (FlowLink-Pflichtdoc)', bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', icon: XCircleIcon },
}

export default function PolizeiberichtUploadCard({
  leadId, polizeiberichtStatus, polizeiberichtHochgeladenAm, telefon, email,
}: Props) {
  const router = useRouter()
  const initialToggle: boolean | null =
    polizeiberichtStatus && ['gesendet', 'geoeffnet', 'hochgeladen'].includes(polizeiberichtStatus) ? true
    : polizeiberichtStatus === 'abgelehnt' ? false
    : null
  const [toggle, setToggle] = useState<boolean | null>(initialToggle)
  const [kanal, setKanal] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  function chooseManuell() {
    setToggle(false)
    startTransition(async () => {
      const r = await saveStammdaten(leadId, { polizeibericht_status: 'abgelehnt' })
      if (!r.success) setFeedback({ ok: false, text: r.error ?? 'Speichern fehlgeschlagen' })
      else router.refresh()
    })
  }

  function send() {
    setFeedback(null)
    startTransition(async () => {
      const r = await triggerPolizeiberichtUploadRequest(leadId, kanal)
      if (r.success) {
        setFeedback({ ok: true, text: `Anfrage per ${kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'} versendet — Kunde antwortet mit Foto` })
        router.refresh()
      } else {
        setFeedback({ ok: false, text: r.error ?? 'Versand fehlgeschlagen' })
      }
    })
  }

  const statusCfg = polizeiberichtStatus && STATUS_UI[polizeiberichtStatus] ? STATUS_UI[polizeiberichtStatus] : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        <ShieldAlertIcon className="w-4 h-4 text-[#4573A2]" />
        Polizeiliche Unfallmitteilung
      </h2>

      {/* AAR-273: Reset-Button — analog ZB1-Card, MA kann Status zurücksetzen */}
      {statusCfg && (
        <div className={`flex items-start gap-2 rounded-lg border p-2 ${statusCfg.bg}`}>
          <statusCfg.icon className={`w-4 h-4 shrink-0 mt-0.5 ${statusCfg.text}`} />
          <p className={`text-[11px] font-medium flex-1 ${statusCfg.text}`}>
            {statusCfg.label}
            {polizeiberichtHochgeladenAm && polizeiberichtStatus === 'hochgeladen' && (
              <span className="block text-[10px] text-gray-500 font-normal mt-0.5">
                {new Date(polizeiberichtHochgeladenAm).toLocaleString('de-DE')}
              </span>
            )}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm('Polizeibericht-Status wirklich zurücksetzen? Bisherige Anfragen bleiben in der Timeline.')) return
              startTransition(async () => {
                const r = await saveStammdaten(leadId, { polizeibericht_status: null })
                if (r.success) { setToggle(null); router.refresh() }
                else setFeedback({ ok: false, text: r.error ?? 'Reset fehlgeschlagen' })
              })
            }}
            className="text-[10px] px-2 py-0.5 rounded border border-current opacity-70 hover:opacity-100 disabled:opacity-30"
            title="Status zurücksetzen"
          >
            Reset
          </button>
        </div>
      )}

      {!statusCfg && (
        <div className="space-y-2">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
            Hat der Kunde die polizeiliche Unfallmitteilung zur Hand?
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setToggle(true)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                toggle === true ? 'bg-[#4573A2] text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              Ja — Foto anfordern
            </button>
            <button
              type="button"
              onClick={chooseManuell}
              disabled={pending}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                toggle === false ? 'bg-gray-500 text-white' : 'bg-gray-100 text-gray-600'
              } disabled:opacity-50`}
            >
              Nein — Kunde reicht später nach
            </button>
          </div>
        </div>
      )}

      {toggle === true && !statusCfg && (
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
            Wie soll die Anfrage versendet werden?
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setKanal('whatsapp')}
              disabled={!telefon}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                kanal === 'whatsapp' ? 'bg-[#25D366] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              } disabled:opacity-40`}
            >
              <MessageSquareIcon className="w-4 h-4" />
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setKanal('sms')}
              disabled={!telefon}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                kanal === 'sms' ? 'bg-amber-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              } disabled:opacity-40`}
            >
              <PhoneIcon className="w-4 h-4" />
              SMS
            </button>
            <button
              type="button"
              onClick={() => setKanal('email')}
              disabled={!email}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                kanal === 'email' ? 'bg-[#4573A2] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              } disabled:opacity-40`}
            >
              <MailIcon className="w-4 h-4" />
              Email
            </button>
          </div>
          <button
            type="button"
            onClick={send}
            disabled={pending}
            className="w-full px-3 py-2 rounded-lg bg-[#0D1B3E] text-white text-xs font-semibold hover:bg-[#1E3A5F] disabled:opacity-50"
          >
            {pending ? 'Sende ...' : 'Anfrage senden'}
          </button>
          {feedback && (
            <p className={`text-[11px] ${feedback.ok ? 'text-green-700' : 'text-red-600'}`}>
              {feedback.text}
            </p>
          )}
          <p className="text-[10px] text-gray-500 italic">
            Der Kunde antwortet direkt per WhatsApp mit Foto — wir legen den
            Polizeibericht in der Fallakte ab und das Aktenzeichen kann zur
            Kontrolle abgeglichen werden.
          </p>
        </div>
      )}

      {toggle === false && !statusCfg && (
        <p className="text-[11px] text-gray-500 italic pt-2 border-t border-gray-100">
          Die Unfallmitteilung wird im Kunden-Portal als Pflichtdokument
          angefordert (FlowLink). Der Kunde lädt sie dort später hoch.
        </p>
      )}
    </div>
  )
}
