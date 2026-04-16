'use client'

// AAR-182: ZB1-Upload-Karte in Phase 4.
// „Fahrzeugschein zur Hand?" Toggle. Bei JA: Kanal wählen (WA/SMS/Email)
// und Anfrage an Kunden versenden. Bei NEIN: nichts — der MA füllt Marke/
// Modell/KZ/Baujahr manuell ein (andere Felder in der Phase 4).
// Der Kunde antwortet direkt per WhatsApp mit Foto — der Twilio-Inbound-
// Webhook wertet das Bild per OCR aus und füllt die Fahrzeug-Felder auf
// dem Lead. Nach Upload wird zb1_status='hochgeladen' und der Dispatcher
// bekommt eine Benachrichtigung.

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { triggerZb1UploadRequest, saveStammdaten } from '../actions'
import {
  FileTextIcon, MessageSquareIcon, PhoneIcon, MailIcon,
  CheckCircle2Icon, ClockIcon, AlertCircleIcon, XCircleIcon,
} from 'lucide-react'

type Props = {
  leadId: string
  zb1Status: string | null
  zb1HochgeladenAm: string | null
  telefon: string | null
  email: string | null
}

const STATUS_UI: Record<string, { label: string; bg: string; text: string; icon: typeof CheckCircle2Icon }> = {
  gesendet: { label: 'Anfrage gesendet — warte auf Foto', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: ClockIcon },
  geoeffnet: { label: 'Kunde hat Anfrage geöffnet', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: ClockIcon },
  hochgeladen: { label: 'Foto eingegangen + Daten ausgelesen', bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle2Icon },
  fehlgeschlagen: { label: 'OCR fehlgeschlagen — manuell eintragen', bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: AlertCircleIcon },
  abgelehnt: { label: 'Manuelle Eingabe gewählt — keine Anfrage', bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', icon: XCircleIcon },
}

export default function Zb1UploadCard({
  leadId, zb1Status, zb1HochgeladenAm, telefon, email,
}: Props) {
  const router = useRouter()
  // AAR-182 Audit-Fix #2: Toggle-State wird aus zb1_status abgeleitet +
  // beim „Nein"-Klick als 'abgelehnt' in der DB gespeichert (vorher nur
  // Client-State, Reload hat die Entscheidung gelöscht).
  const initialToggle: boolean | null =
    zb1Status && ['gesendet', 'geoeffnet', 'hochgeladen'].includes(zb1Status) ? true
    : zb1Status === 'abgelehnt' ? false
    : null
  const [toggle, setToggle] = useState<boolean | null>(initialToggle)
  const [kanal, setKanal] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  // AAR-296 W4: Polling während Status='gesendet'/'geoeffnet' — alle 10s
  // router.refresh() um Kunden-Upload sofort zu sehen. Stoppt automatisch
  // wenn Status wechselt.
  useEffect(() => {
    if (zb1Status !== 'gesendet' && zb1Status !== 'geoeffnet') return
    const iv = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(iv)
  }, [zb1Status, router])

  function chooseManuell() {
    setToggle(false)
    // Persistieren via saveStammdaten — zb1_status ist in der Allowlist
    // (wird via Audit-Fix unten ergänzt).
    startTransition(async () => {
      const r = await saveStammdaten(leadId, { zb1_status: 'abgelehnt' })
      if (!r.success) setFeedback({ ok: false, text: r.error ?? 'Speichern fehlgeschlagen' })
      else router.refresh()
    })
  }

  function send() {
    setFeedback(null)
    startTransition(async () => {
      const r = await triggerZb1UploadRequest(leadId, kanal)
      if (r.success) {
        setFeedback({ ok: true, text: `Anfrage per ${kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'} versendet — Kunde antwortet mit Foto` })
        router.refresh()
      } else {
        setFeedback({ ok: false, text: r.error ?? 'Versand fehlgeschlagen' })
      }
    })
  }

  const statusCfg = zb1Status && STATUS_UI[zb1Status] ? STATUS_UI[zb1Status] : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        <FileTextIcon className="w-4 h-4 text-[#4573A2]" />
        Fahrzeugschein
      </h2>

      {/* Status-Badge falls bereits versendet/hochgeladen.
          AAR-273: Reset-Button rechts — MA kann Status zurücksetzen
          falls falsch gesetzt oder neuer Anlauf nötig. */}
      {statusCfg && (
        <div className={`flex items-start gap-2 rounded-lg border p-2 ${statusCfg.bg}`}>
          <statusCfg.icon className={`w-4 h-4 shrink-0 mt-0.5 ${statusCfg.text}`} />
          <p className={`text-[11px] font-medium flex-1 ${statusCfg.text}`}>
            {statusCfg.label}
            {zb1HochgeladenAm && zb1Status === 'hochgeladen' && (
              <span className="block text-[10px] text-gray-500 font-normal mt-0.5">
                {new Date(zb1HochgeladenAm).toLocaleString('de-DE')}
              </span>
            )}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm('ZB1-Status wirklich zurücksetzen? Bisherige Anfragen bleiben in der Timeline, aber die Karte zeigt wieder den Toggle „zur Hand?".')) return
              startTransition(async () => {
                const r = await saveStammdaten(leadId, { zb1_status: null })
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

      {/* Toggle: Fahrzeugschein zur Hand? */}
      {!statusCfg && (
        <div className="space-y-2">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
            Hat der Kunde den Fahrzeugschein zur Hand?
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
              Nein — manuell eintragen
            </button>
          </div>
        </div>
      )}

      {/* Kanal-Auswahl + Send-Button */}
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
            Der Kunde antwortet direkt per WhatsApp mit Foto — wir lesen die Daten
            automatisch aus (OCR) und füllen KZ, Marke, Modell, Baujahr ein.
          </p>
        </div>
      )}

      {toggle === false && !statusCfg && (
        <p className="text-[11px] text-gray-500 italic pt-2 border-t border-gray-100">
          Kennzeichen, Marke, Modell und Baujahr werden manuell in den Feldern
          oben eingetragen. Kunde muss den Fahrzeugschein später im Portal
          hochladen (Pflichtdokument).
        </p>
      )}
    </div>
  )
}
