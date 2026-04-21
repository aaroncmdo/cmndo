'use client'

// AAR-352: Kombinierte Dokumenten-Anfrage-Karte — ersetzt Zb1UploadCard und
// PolizeiberichtUploadCard. Der Dispatcher wählt per Checkbox welche Dokumente
// in einem Link angefragt werden (Fahrzeugschein mit/ohne OCR, Polizeibericht,
// sonstige Dokumente mit freiem Label) und versendet eine einzige WhatsApp-
// /SMS-/Email-Nachricht mit Multi-Slot-Upload-Link.
//
// Legacy-Felder (zb1_status, polizeibericht_status) werden in der Server-
// Action gespiegelt, damit der Twilio-Inbound-Webhook weiter funktioniert,
// wenn der Kunde mit Foto per WA antwortet statt den Link zu nutzen.

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { triggerDokumenteUploadRequest, saveStammdaten } from '../actions'
import type { SlotEingabe } from '../actions/dokumente-anfordern'
import {
  FileTextIcon,
  ShieldAlertIcon,
  PlusIcon,
  MessageSquareIcon,
  PhoneIcon,
  MailIcon,
  CheckCircle2Icon,
  ClockIcon,
  AlertCircleIcon,
  XCircleIcon,
  XIcon,
  CameraIcon,
} from 'lucide-react'

type Props = {
  leadId: string
  zb1Status: string | null
  zb1HochgeladenAm: string | null
  polizeiberichtStatus: string | null
  polizeiberichtHochgeladenAm: string | null
  zeigePolizeibericht: boolean
  telefon: string | null
  email: string | null
  // AAR-unfallfotos: Wenn bereits Fotos im Lead liegen, Checkbox nicht auto-
  // vorwählen; Dispatcher kann sie trotzdem manuell setzen (Nachreichung).
  unfallfotosVorhanden: boolean
  // AAR-unfallfotos: Extern gesetzter „Kunde hat Unfallfotos"-Trigger aus der
  // Schadenbeschreibung-Card in Phase 4. Wenn true → unfallfotos-Checkbox
  // wird vorgewählt und die Schadenbeschreibungs-Card scrollt zum Button.
  unfallfotosAnfragenDefault?: boolean
  // AAR-unfallfotos-callback: Thumbnails + Analyse-Status für den Dispatcher.
  // Kommt direkt aus den Lead-Spalten — Parent reicht sie durch, damit der
  // Polling-Refresh den Haiku-Status sichtbar macht.
  schadensfotoUrls?: string[] | null
  sachschadenBeschreibung?: string | null
}

type SonstigesEintrag = { id: number; label: string }

const STATUS_UI: Record<string, { label: string; bg: string; text: string; icon: typeof CheckCircle2Icon }> = {
  gesendet: { label: 'Anfrage gesendet — warte auf Foto', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: ClockIcon },
  geoeffnet: { label: 'Kunde hat Anfrage geöffnet', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: ClockIcon },
  hochgeladen: { label: 'Foto eingegangen', bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle2Icon },
  fehlgeschlagen: { label: 'Upload fehlgeschlagen — manuell nacharbeiten', bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: AlertCircleIcon },
  abgelehnt: { label: 'Manuelle Erfassung gewählt', bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', icon: XCircleIcon },
}

export default function DokumenteAnfordernCard({
  leadId,
  zb1Status,
  zb1HochgeladenAm,
  polizeiberichtStatus,
  polizeiberichtHochgeladenAm,
  zeigePolizeibericht,
  telefon,
  email,
  unfallfotosVorhanden,
  unfallfotosAnfragenDefault,
  schadensfotoUrls,
  sachschadenBeschreibung,
}: Props) {
  const router = useRouter()

  // Slot-Auswahl — Fahrzeugschein vorausgewählt wenn noch nicht hochgeladen
  const [selectFahrzeugschein, setSelectFahrzeugschein] = useState(
    !zb1Status || ['abgelehnt', 'fehlgeschlagen'].includes(zb1Status),
  )
  const [fahrzeugscheinOcr, setFahrzeugscheinOcr] = useState(true)
  const [selectPolizeibericht, setSelectPolizeibericht] = useState(
    zeigePolizeibericht && (!polizeiberichtStatus || ['abgelehnt', 'fehlgeschlagen'].includes(polizeiberichtStatus)),
  )
  // AAR-unfallfotos: Checkbox für Unfallfoto-Anforderung. Default:
  // vorgewählt wenn Parent per `unfallfotosAnfragenDefault` signalisiert
  // (Kunde hat Fotos) UND noch keine im Lead liegen.
  const [selectUnfallfotos, setSelectUnfallfotos] = useState(
    !!unfallfotosAnfragenDefault && !unfallfotosVorhanden,
  )
  const [sonstige, setSonstige] = useState<SonstigesEintrag[]>([])
  const [nextId, setNextId] = useState(1)

  // Parent-Trigger „Kunde hat Unfallfotos" nachträglich aktivieren
  useEffect(() => {
    if (unfallfotosAnfragenDefault && !unfallfotosVorhanden) {
      setSelectUnfallfotos(true)
    }
  }, [unfallfotosAnfragenDefault, unfallfotosVorhanden])

  const [kanal, setKanal] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  // Polling während offene Anfrage läuft. AAR-unfallfotos-callback: auch
  // Unfallfoto-Anfragen pollen — der Kunde lädt Fotos einzeln nacheinander
  // hoch und Haiku braucht ein paar Sekunden, beides soll automatisch
  // aktualisiert angezeigt werden.
  const fotosCount = Array.isArray(schadensfotoUrls) ? schadensfotoUrls.length : 0
  const unfallfotosPollingAktiv = selectUnfallfotos || fotosCount > 0
  useEffect(() => {
    const läuft =
      (zb1Status === 'gesendet' || zb1Status === 'geoeffnet') ||
      (polizeiberichtStatus === 'gesendet' || polizeiberichtStatus === 'geoeffnet') ||
      unfallfotosPollingAktiv
    if (!läuft) return
    const iv = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(iv)
  }, [zb1Status, polizeiberichtStatus, unfallfotosPollingAktiv, router])

  // Analyse-Status des Unfallfoto-Slots:
  // - fotosCount === 0  → „warte auf Fotos" (falls angefragt) / nichts
  // - fotosCount > 0 + keine Beschreibung → „Analyse läuft"
  // - fotosCount > 0 + Beschreibung → „Analyse erfolgreich"
  // - fotosCount > 0 + Beschreibung startet mit „Schaden auf Foto nicht" → „Analyse unklar"
  const haikuBeschreibung = sachschadenBeschreibung?.trim() ?? ''
  const haikuUnklar = haikuBeschreibung.toLowerCase().startsWith('schaden auf foto nicht')
  const unfallfotosAnalyseStatus: 'warte' | 'laeuft' | 'erfolg' | 'unklar' | null =
    fotosCount === 0
      ? selectUnfallfotos
        ? 'warte'
        : null
      : haikuBeschreibung.length === 0
        ? 'laeuft'
        : haikuUnklar
          ? 'unklar'
          : 'erfolg'

  const zb1Cfg = zb1Status && STATUS_UI[zb1Status] ? STATUS_UI[zb1Status] : null
  const poliCfg = polizeiberichtStatus && STATUS_UI[polizeiberichtStatus] ? STATUS_UI[polizeiberichtStatus] : null

  function addSonstiges() {
    setSonstige((prev) => [...prev, { id: nextId, label: '' }])
    setNextId((n) => n + 1)
  }

  function updateSonstiges(id: number, label: string) {
    setSonstige((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)))
  }

  function removeSonstiges(id: number) {
    setSonstige((prev) => prev.filter((s) => s.id !== id))
  }

  function resetStatus(feld: 'zb1_status' | 'polizeibericht_status') {
    if (!confirm('Status wirklich zurücksetzen? Bisherige Anfragen bleiben in der Timeline.')) return
    startTransition(async () => {
      const r = await saveStammdaten(leadId, { [feld]: null })
      if (r.success) router.refresh()
      else setFeedback({ ok: false, text: r.error ?? 'Reset fehlgeschlagen' })
    })
  }

  function markManuell(feld: 'zb1_status' | 'polizeibericht_status') {
    startTransition(async () => {
      const r = await saveStammdaten(leadId, { [feld]: 'abgelehnt' })
      if (r.success) router.refresh()
      else setFeedback({ ok: false, text: r.error ?? 'Speichern fehlgeschlagen' })
    })
  }

  function send() {
    const slots: SlotEingabe[] = []
    if (selectFahrzeugschein) {
      slots.push({ slot_id: 'fahrzeugschein', ocr: fahrzeugscheinOcr })
    }
    if (selectPolizeibericht) {
      slots.push({ slot_id: 'polizeibericht' })
    }
    if (selectUnfallfotos) {
      slots.push({ slot_id: 'unfallfotos' })
    }
    for (const s of sonstige) {
      const trimmed = s.label.trim()
      if (trimmed.length > 0) {
        slots.push({ slot_id: 'sonstiges', label: trimmed })
      }
    }
    if (slots.length === 0) {
      setFeedback({ ok: false, text: 'Mindestens ein Dokument auswählen' })
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const r = await triggerDokumenteUploadRequest(leadId, slots, kanal)
      if (r.success) {
        setFeedback({
          ok: true,
          text: `Anfrage per ${kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'} versendet — ${slots.length} ${slots.length === 1 ? 'Dokument' : 'Dokumente'} angefragt`,
        })
        setSonstige([])
        router.refresh()
      } else {
        setFeedback({ ok: false, text: r.error ?? 'Versand fehlgeschlagen' })
      }
    })
  }

  const kannAnfragen =
    selectFahrzeugschein ||
    selectPolizeibericht ||
    selectUnfallfotos ||
    sonstige.some((s) => s.label.trim().length > 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        <FileTextIcon className="w-4 h-4 text-[#4573A2]" />
        Dokumente beim Kunden anfordern
      </h2>

      {/* Status-Badges für laufende/abgeschlossene Anfragen */}
      <div className="space-y-2">
        {zb1Cfg && (
          <div className={`flex items-start gap-2 rounded-lg border p-2 ${zb1Cfg.bg}`}>
            <zb1Cfg.icon className={`w-4 h-4 shrink-0 mt-0.5 ${zb1Cfg.text}`} />
            <p className={`text-[11px] font-medium flex-1 ${zb1Cfg.text}`}>
              <span className="font-semibold">Fahrzeugschein:</span> {zb1Cfg.label}
              {zb1HochgeladenAm && zb1Status === 'hochgeladen' && (
                <span className="block text-[10px] text-gray-500 font-normal mt-0.5">
                  {new Date(zb1HochgeladenAm).toLocaleString('de-DE')}
                </span>
              )}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => resetStatus('zb1_status')}
              className="text-[10px] px-2 py-0.5 rounded border border-current opacity-70 hover:opacity-100 disabled:opacity-30"
            >
              Reset
            </button>
          </div>
        )}
        {poliCfg && zeigePolizeibericht && (
          <div className={`flex items-start gap-2 rounded-lg border p-2 ${poliCfg.bg}`}>
            <poliCfg.icon className={`w-4 h-4 shrink-0 mt-0.5 ${poliCfg.text}`} />
            <p className={`text-[11px] font-medium flex-1 ${poliCfg.text}`}>
              <span className="font-semibold">Polizeibericht:</span> {poliCfg.label}
              {polizeiberichtHochgeladenAm && polizeiberichtStatus === 'hochgeladen' && (
                <span className="block text-[10px] text-gray-500 font-normal mt-0.5">
                  {new Date(polizeiberichtHochgeladenAm).toLocaleString('de-DE')}
                </span>
              )}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => resetStatus('polizeibericht_status')}
              className="text-[10px] px-2 py-0.5 rounded border border-current opacity-70 hover:opacity-100 disabled:opacity-30"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Slot-Auswahl — Checkboxen für bekannte Slots + freie „sonstige" */}
      <div className="space-y-2 pt-1">
        <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
          Welche Dokumente anfordern?
        </label>

        {/* Fahrzeugschein */}
        <div className={`rounded-lg border p-3 ${selectFahrzeugschein ? 'border-[#4573A2] bg-blue-50/30' : 'border-gray-200'}`}>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectFahrzeugschein}
              onChange={(e) => setSelectFahrzeugschein(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#4573A2]"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <FileTextIcon className="w-3.5 h-3.5 text-[#4573A2]" />
                <span className="text-xs font-semibold text-gray-900">Fahrzeugschein (Vorderseite)</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Zulassungsbescheinigung Teil I. Daten werden automatisch per OCR ausgelesen.
              </p>
              {selectFahrzeugschein && (
                <label className="flex items-center gap-1.5 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fahrzeugscheinOcr}
                    onChange={(e) => setFahrzeugscheinOcr(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#4573A2]"
                  />
                  <span className="text-[10px] text-gray-600">
                    OCR-Auswertung aktivieren (Marke, KZ, Halter automatisch befüllen)
                  </span>
                </label>
              )}
            </div>
          </label>
          {!zb1Cfg && (
            <button
              type="button"
              disabled={pending}
              onClick={() => markManuell('zb1_status')}
              className="text-[10px] text-gray-500 underline mt-2 hover:text-gray-700 disabled:opacity-30"
            >
              Manuell eintragen (keine Anfrage)
            </button>
          )}
        </div>

        {/* Polizeibericht — nur wenn polizei_vor_ort=true UND polizeibericht_pflicht=true */}
        {zeigePolizeibericht && (
          <div className={`rounded-lg border p-3 ${selectPolizeibericht ? 'border-[#4573A2] bg-blue-50/30' : 'border-gray-200'}`}>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectPolizeibericht}
                onChange={(e) => setSelectPolizeibericht(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#4573A2]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <ShieldAlertIcon className="w-3.5 h-3.5 text-[#4573A2]" />
                  <span className="text-xs font-semibold text-gray-900">Polizeiliche Unfallmitteilung</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Der Zettel, den der Kunde von der Polizei bekommen hat.
                </p>
              </div>
            </label>
            {!poliCfg && (
              <button
                type="button"
                disabled={pending}
                onClick={() => markManuell('polizeibericht_status')}
                className="text-[10px] text-gray-500 underline mt-2 hover:text-gray-700 disabled:opacity-30"
              >
                Kunde reicht später im Portal nach
              </button>
            )}
          </div>
        )}

        {/* AAR-unfallfotos: Unfallfotos-Slot. Multi-File — Kunde kann mehrere
            Fotos via denselben Link hochladen. Nach Upload läuft Haiku-Vision
            und füllt leads.sachschaden_beschreibung automatisch. */}
        <div className={`rounded-lg border p-3 ${selectUnfallfotos || fotosCount > 0 ? 'border-[#4573A2] bg-blue-50/30' : 'border-gray-200'}`}>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectUnfallfotos}
              onChange={(e) => setSelectUnfallfotos(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#4573A2]"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <CameraIcon className="w-3.5 h-3.5 text-[#4573A2]" />
                <span className="text-xs font-semibold text-gray-900">Unfallfotos</span>
                {fotosCount > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">
                    {fotosCount} Foto{fotosCount === 1 ? '' : 's'} eingegangen
                  </span>
                )}
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Fotos vom Fahrzeugschaden (mehrere Ansichten möglich). Claude-
                Vision (Haiku) wertet die Fotos aus und füllt die Schadenbeschreibung.
              </p>
            </div>
          </label>

          {/* AAR-unfallfotos-callback: Analyse-Status-Badge.
              warte = Upload-Link ist raus, Kunde hat noch nichts geschickt.
              laeuft = mind. 1 Foto da, Haiku läuft noch (Beschreibung leer).
              unklar = Haiku hat „Schaden nicht eindeutig erkennbar" geliefert.
              erfolg = Haiku hat eine Schadenbeschreibung geschrieben. */}
          {unfallfotosAnalyseStatus === 'warte' && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <ClockIcon className="w-3 h-3 shrink-0" />
              <span>Anfrage gesendet — warte auf Fotos vom Kunden …</span>
            </div>
          )}
          {unfallfotosAnalyseStatus === 'laeuft' && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
              <span>Foto{fotosCount === 1 ? '' : 's'} eingegangen — Claude analysiert den Schaden …</span>
            </div>
          )}
          {unfallfotosAnalyseStatus === 'unklar' && (
            <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <AlertCircleIcon className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                Schaden auf Foto nicht eindeutig erkennbar — Schadenbeschreibung
                bitte manuell ergänzen (oder schärfere Fotos nachfordern).
              </span>
            </div>
          )}
          {unfallfotosAnalyseStatus === 'erfolg' && (
            <div className="mt-2 flex items-start gap-2 text-[11px] text-green-800 bg-green-50 border border-green-200 rounded px-2 py-1.5">
              <CheckCircle2Icon className="w-3 h-3 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Analyse erfolgreich — Schadenbeschreibung gefüllt.</p>
                <p className="text-green-700 mt-0.5 line-clamp-2">{haikuBeschreibung}</p>
              </div>
            </div>
          )}

          {/* Thumbnail-Strip: jedes Foto anklickbar → Original in neuem Tab. */}
          {fotosCount > 0 && Array.isArray(schadensfotoUrls) && (
            <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {schadensfotoUrls.map((url, i) => (
                <a
                  key={`${url}-${i}`}
                  href={url}
                  target="_blank"
                  rel="noopener"
                  className="relative block aspect-square rounded overflow-hidden border border-gray-200 hover:border-[#4573A2] focus:outline-none focus:ring-2 focus:ring-[#4573A2]"
                  title={`Foto ${i + 1} — klicken zum Vergrößern`}
                >
                  <img
                    src={url}
                    alt={`Unfallfoto ${i + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Freie „Sonstige"-Slots */}
        {sonstige.map((s) => (
          <div key={s.id} className="rounded-lg border border-gray-200 p-3 flex items-center gap-2">
            <PlusIcon className="w-3.5 h-3.5 text-[#4573A2] shrink-0" />
            <input
              type="text"
              value={s.label}
              onChange={(e) => updateSonstiges(s.id, e.target.value)}
              placeholder="z. B. Kaufvertrag, Rechnung ..."
              className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
            />
            <button
              type="button"
              onClick={() => removeSonstiges(s.id)}
              className="text-gray-400 hover:text-red-600"
              title="Entfernen"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addSonstiges}
          className="w-full text-[11px] text-[#4573A2] border border-dashed border-[#4573A2]/50 rounded-lg py-1.5 hover:bg-blue-50 flex items-center justify-center gap-1"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Weiteres Dokument hinzufügen
        </button>
      </div>

      {/* Kanal-Auswahl + Send-Button */}
      {kannAnfragen && (
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
            Versandkanal
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
            disabled={pending || !kannAnfragen}
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
            Der Kunde erhält einen Link und kann alle Dokumente in einem Flow hochladen.
            Antwortet er stattdessen per WhatsApp-Foto, wird das weiterhin über den
            Twilio-Webhook empfangen.
          </p>
        </div>
      )}
    </div>
  )
}
