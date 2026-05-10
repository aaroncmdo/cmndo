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

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { triggerDokumenteUploadRequest, saveStammdaten } from '../actions'
import type { SlotEingabe } from '../_actions/dokumente-anfordern'
import { berechneErwartung } from '@/lib/dokumente/erwartung'
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
  StethoscopeIcon,
  ReceiptIcon,
  UsersIcon,
} from 'lucide-react'

type Props = {
  leadId: string
  // AAR-erwartung: Lead-Datensatz wird durchgereicht — die Card berechnet
  // ihre Slot-Visibility selbst aus berechneErwartung(lead) statt aus
  // mehreren bool-Props. Eine Quelle der Wahrheit für „welche Slots
  // erwartet werden".
  lead: Record<string, unknown>
  zb1HochgeladenAm: string | null
  polizeiberichtHochgeladenAm: string | null
  telefon: string | null
  email: string | null
  // AAR-unfallfotos: Wenn bereits Fotos im Lead liegen, Checkbox nicht auto-
  // vorwählen; Dispatcher kann sie trotzdem manuell setzen (Nachreichung).
  unfallfotosVorhanden: boolean
  // AAR-unfallfotos: Extern gesetzter „Kunde hat Unfallfotos"-Trigger aus der
  // Schadenbeschreibung-Card in Phase 4.
  unfallfotosAnfragenDefault?: boolean
  // AAR-unfallfotos-callback: Thumbnails + Analyse-Status für den Dispatcher.
  schadensfotoUrls?: string[] | null
  sachschadenBeschreibung?: string | null
}

type SonstigesEintrag = { id: number; label: string }

const STATUS_UI: Record<string, { label: string; bg: string; text: string; icon: typeof CheckCircle2Icon }> = {
  gesendet: { label: 'Anfrage gesendet — warte auf Foto', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: ClockIcon },
  geoeffnet: { label: 'Kunde hat Anfrage geöffnet', bg: 'bg-[#f8f9fb] border-claimondo-border', text: 'text-claimondo-ondo', icon: ClockIcon },
  hochgeladen: { label: 'Foto eingegangen', bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle2Icon },
  fehlgeschlagen: { label: 'Upload fehlgeschlagen — manuell nacharbeiten', bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: AlertCircleIcon },
  abgelehnt: { label: 'Manuelle Erfassung gewählt', bg: 'bg-[#f8f9fb] border-claimondo-border', text: 'text-claimondo-ondo', icon: XCircleIcon },
}

export default function DokumenteAnfordernCard({
  leadId,
  lead,
  zb1HochgeladenAm,
  polizeiberichtHochgeladenAm,
  telefon,
  email,
  unfallfotosVorhanden,
  unfallfotosAnfragenDefault,
  schadensfotoUrls,
  sachschadenBeschreibung,
}: Props) {
  const zb1Status = (lead.zb1_status as string | null) ?? null
  const polizeiberichtStatus = (lead.polizeibericht_status as string | null) ?? null

  // AAR-erwartung: Eine Quelle der Wahrheit. Welche Slots der Dispatcher
  // sieht, ergibt sich aus berechneErwartung(lead) — kein verteiltes
  // Conditional pro Slot. Override-Toggle weiter unten zeigt zusätzlich
  // alle möglichen Slots, falls das Lead-Form unvollständig war.
  const erwartet = useMemo(
    () => berechneErwartung(lead as Parameters<typeof berechneErwartung>[0]),
    [lead],
  )
  const erwarteteIds = useMemo(() => new Set(erwartet.map((s) => s.slot_id)), [erwartet])

  const zeigePolizeibericht = erwarteteIds.has('polizeibericht')
  const sichtbarSachschadenFoto_initial = erwarteteIds.has('sachschaden_foto')
  const sichtbarSachschadenRechnung_initial = erwarteteIds.has('sachschaden_rechnung')
  const sichtbarAttest_initial = erwarteteIds.has('aerztliches_attest')
  const sichtbarDiagnose_initial = erwarteteIds.has('diagnosebericht')
  const sichtbarZeugen_initial = erwarteteIds.has('zeugenaussage')
  // Echter „Anfrage offen"-State aus dokument_upload_anfragen.
  // Wird beim Mount + bei jedem Polling-Tick neu geladen, damit die UI
  // sich nicht durch bloßes Setzen der Checkbox falsch zeigt.
  const [serverAnfrageOffen, setServerAnfrageOffen] = useState(false)
  // Lokaler Override für die Sekunden direkt nach „Anfrage senden" — damit
  // der „warte auf Fotos"-Hinweis sofort erscheint, ohne auf Server-Refresh
  // zu warten.
  const [eigeneAnfrageEbenGesendet, setEigeneAnfrageEbenGesendet] = useState(false)
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
  const [selectSachschadenFoto, setSelectSachschadenFoto] = useState(false)
  const [selectSachschadenRechnung, setSelectSachschadenRechnung] = useState(false)
  const [selectAttest, setSelectAttest] = useState(false)
  const [selectDiagnosebericht, setSelectDiagnosebericht] = useState(false)
  const [selectZeugenaussage, setSelectZeugenaussage] = useState(false)
  const [sonstige, setSonstige] = useState<SonstigesEintrag[]>([])
  const [nextId, setNextId] = useState(1)
  // Override-Toggle: zeigt conditional Slots (Sachschaden/Personenschaden/
  // Zeugen) auch dann wenn die Lead-Flags nicht gesetzt sind. Dispatcher
  // kann manuell aktivieren wenn er im Call merkt dass es z.B. einen Zeugen
  // gibt obwohl das im Lead-Form nicht ausgefüllt war.
  const [zeigeAlleSlots, setZeigeAlleSlots] = useState(false)
  const sichtbarSachschaden = sichtbarSachschadenFoto_initial || sichtbarSachschadenRechnung_initial || zeigeAlleSlots
  const sichtbarPersonenschaden = sichtbarAttest_initial || sichtbarDiagnose_initial || zeigeAlleSlots
  const sichtbarZeugen = sichtbarZeugen_initial || zeigeAlleSlots

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
  const unfallfotosPollingAktiv =
    serverAnfrageOffen || eigeneAnfrageEbenGesendet || fotosCount > 0

  // Lädt aus dokument_upload_anfragen ob eine offene unfallfotos-Anfrage
  // existiert. Re-loadet beim Mount + jeden Polling-Tick (10s).
  useEffect(() => {
    let cancelled = false
    async function check() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data } = await supabase
        .from('dokument_upload_anfragen')
        .select('slots, status')
        .eq('lead_id', leadId)
        .eq('status', 'gesendet')
        .order('erstellt_am', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      if (!data) {
        setServerAnfrageOffen(false)
        return
      }
      const slots = (data.slots as Array<{ slot_id: string; hochgeladen?: boolean }> | null) ?? []
      const offen = slots.some((s) => s.slot_id === 'unfallfotos' && !s.hochgeladen)
      setServerAnfrageOffen(offen)
    }
    void check()
    const iv = setInterval(check, 10_000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [leadId])
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
  // - fotosCount === 0 + Anfrage gesendet → „warte auf Fotos"
  // - fotosCount === 0 + keine Anfrage    → kein Status (nur Checkbox-Vorauswahl)
  // - fotosCount > 0 + keine Beschreibung → „Analyse läuft"
  // - fotosCount > 0 + Beschreibung       → „Analyse erfolgreich"
  // - fotosCount > 0 + Beschreibung startet mit „Schaden auf Foto nicht" → „Analyse unklar"
  // BUGFIX (Aaron): vorher reichte selectUnfallfotos (UI-Checkbox) aus, was
  // beim bloßen Vor-Auswählen der Checkbox bereits „Anfrage gesendet" zeigte.
  // Jetzt wird nur ein echter Server-Status oder ein gerade abgesendeter
  // lokaler State akzeptiert.
  const istAnfrageOffen = serverAnfrageOffen || eigeneAnfrageEbenGesendet
  const haikuBeschreibung = sachschadenBeschreibung?.trim() ?? ''
  const haikuUnklar = haikuBeschreibung.toLowerCase().startsWith('schaden auf foto nicht')
  const unfallfotosAnalyseStatus: 'warte' | 'laeuft' | 'erfolg' | 'unklar' | null =
    fotosCount === 0
      ? istAnfrageOffen
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
    if (selectSachschadenFoto) {
      slots.push({ slot_id: 'sachschaden_foto' })
    }
    if (selectSachschadenRechnung) {
      slots.push({ slot_id: 'sachschaden_rechnung' })
    }
    if (selectAttest) {
      slots.push({ slot_id: 'aerztliches_attest' })
    }
    if (selectDiagnosebericht) {
      slots.push({ slot_id: 'diagnosebericht' })
    }
    if (selectZeugenaussage) {
      slots.push({ slot_id: 'zeugenaussage' })
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
    const enthaeltUnfallfotos = slots.some((s) => s.slot_id === 'unfallfotos')
    startTransition(async () => {
      const r = await triggerDokumenteUploadRequest(leadId, slots, kanal)
      if (r.success) {
        setFeedback({
          ok: true,
          text: `Anfrage per ${kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'} versendet — ${slots.length} ${slots.length === 1 ? 'Dokument' : 'Dokumente'} angefragt`,
        })
        setSonstige([])
        // Sofortiger Override damit „warte auf Fotos" zwischen Versand und
        // Server-Refresh sichtbar wird, falls unfallfotos im Slot-Set war.
        if (enthaeltUnfallfotos) setEigeneAnfrageEbenGesendet(true)
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
    selectSachschadenFoto ||
    selectSachschadenRechnung ||
    selectAttest ||
    selectDiagnosebericht ||
    selectZeugenaussage ||
    sonstige.some((s) => s.label.trim().length > 0)

  return (
    <div className="bg-white rounded-xl border border-claimondo-border p-5 space-y-4">
      <h2 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
        <FileTextIcon className="w-4 h-4 text-claimondo-ondo" />
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
                <span className="block text-[10px] text-claimondo-ondo font-normal mt-0.5">
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
                <span className="block text-[10px] text-claimondo-ondo font-normal mt-0.5">
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
        <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">
          Welche Dokumente anfordern?
        </label>

        {/* Fahrzeugschein */}
        <div className={`rounded-lg border p-3 ${selectFahrzeugschein ? 'border-claimondo-ondo bg-[#f8f9fb]/30' : 'border-claimondo-border'}`}>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectFahrzeugschein}
              onChange={(e) => setSelectFahrzeugschein(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-claimondo-ondo"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <FileTextIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                <span className="text-xs font-semibold text-claimondo-navy">Fahrzeugschein (Vorderseite)</span>
              </div>
              <p className="text-[10px] text-claimondo-ondo mt-0.5">
                Zulassungsbescheinigung Teil I. Daten werden automatisch per OCR ausgelesen.
              </p>
              {selectFahrzeugschein && (
                <label className="flex items-center gap-1.5 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fahrzeugscheinOcr}
                    onChange={(e) => setFahrzeugscheinOcr(e.target.checked)}
                    className="w-3.5 h-3.5 accent-claimondo-ondo"
                  />
                  <span className="text-[10px] text-claimondo-ondo">
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
              className="text-[10px] text-claimondo-ondo underline mt-2 hover:text-claimondo-navy disabled:opacity-30"
            >
              Manuell eintragen (keine Anfrage)
            </button>
          )}
        </div>

        {/* Polizeibericht — nur wenn polizei_vor_ort=true UND polizeibericht_pflicht=true */}
        {zeigePolizeibericht && (
          <div className={`rounded-lg border p-3 ${selectPolizeibericht ? 'border-claimondo-ondo bg-[#f8f9fb]/30' : 'border-claimondo-border'}`}>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectPolizeibericht}
                onChange={(e) => setSelectPolizeibericht(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-claimondo-ondo"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <ShieldAlertIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                  <span className="text-xs font-semibold text-claimondo-navy">Polizeiliche Unfallmitteilung</span>
                </div>
                <p className="text-[10px] text-claimondo-ondo mt-0.5">
                  Der Zettel, den der Kunde von der Polizei bekommen hat.
                </p>
              </div>
            </label>
            {!poliCfg && (
              <button
                type="button"
                disabled={pending}
                onClick={() => markManuell('polizeibericht_status')}
                className="text-[10px] text-claimondo-ondo underline mt-2 hover:text-claimondo-navy disabled:opacity-30"
              >
                Kunde reicht später im Portal nach
              </button>
            )}
          </div>
        )}

        {/* AAR-unfallfotos: Unfallfotos-Slot. Multi-File — Kunde kann mehrere
            Fotos via denselben Link hochladen. Nach Upload läuft Haiku-Vision
            und füllt leads.fahrzeugschaden_beschreibung automatisch. */}
        <div className={`rounded-lg border p-3 ${selectUnfallfotos || fotosCount > 0 ? 'border-claimondo-ondo bg-[#f8f9fb]/30' : 'border-claimondo-border'}`}>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectUnfallfotos}
              onChange={(e) => setSelectUnfallfotos(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-claimondo-ondo"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <CameraIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                <span className="text-xs font-semibold text-claimondo-navy">Unfallfotos</span>
                {fotosCount > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">
                    {fotosCount} Foto{fotosCount === 1 ? '' : 's'} eingegangen
                  </span>
                )}
              </div>
              <p className="text-[10px] text-claimondo-ondo mt-0.5">
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
            <div className="mt-2 flex items-center gap-2 text-[11px] text-claimondo-ondo bg-[#f8f9fb] border border-claimondo-border rounded px-2 py-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#f8f9fb]0 animate-pulse shrink-0" />
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
                  className="relative block aspect-square rounded overflow-hidden border border-claimondo-border hover:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
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

        {/* Sachschaden-Slots — wenn hat_sachschaden=true ODER manuell aufgeklappt */}
        {sichtbarSachschaden && (
          <>
            <div className={`rounded-lg border p-3 ${selectSachschadenFoto ? 'border-claimondo-ondo bg-claimondo-bg/30' : 'border-claimondo-border'}`}>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectSachschadenFoto}
                  onChange={(e) => setSelectSachschadenFoto(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-claimondo-ondo"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <CameraIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                    <span className="text-xs font-semibold text-claimondo-navy">Fotos des Sachschadens</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">Sachschaden</span>
                  </div>
                  <p className="text-[10px] text-claimondo-ondo mt-0.5">
                    Fotos des beschädigten Gegenstands (z. B. Handy, Brille, Kleidung).
                  </p>
                </div>
              </label>
            </div>
            <div className={`rounded-lg border p-3 ${selectSachschadenRechnung ? 'border-claimondo-ondo bg-claimondo-bg/30' : 'border-claimondo-border'}`}>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectSachschadenRechnung}
                  onChange={(e) => setSelectSachschadenRechnung(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-claimondo-ondo"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <ReceiptIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                    <span className="text-xs font-semibold text-claimondo-navy">Rechnung / Kostenvoranschlag Sachschaden</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">Sachschaden</span>
                  </div>
                  <p className="text-[10px] text-claimondo-ondo mt-0.5">
                    Reparaturrechnung oder Kostenvoranschlag für den beschädigten Gegenstand.
                  </p>
                </div>
              </label>
            </div>
          </>
        )}

        {/* Personenschaden-Slots — wenn hat_personenschaden=true ODER manuell aufgeklappt */}
        {sichtbarPersonenschaden && (
          <>
            <div className={`rounded-lg border p-3 ${selectAttest ? 'border-claimondo-ondo bg-claimondo-bg/30' : 'border-claimondo-border'}`}>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectAttest}
                  onChange={(e) => setSelectAttest(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-claimondo-ondo"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <StethoscopeIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                    <span className="text-xs font-semibold text-claimondo-navy">Ärztliches Attest</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">Personenschaden</span>
                  </div>
                  <p className="text-[10px] text-claimondo-ondo mt-0.5">
                    Ärztliche Bescheinigung über Verletzungen infolge des Unfalls.
                  </p>
                </div>
              </label>
            </div>
            <div className={`rounded-lg border p-3 ${selectDiagnosebericht ? 'border-claimondo-ondo bg-claimondo-bg/30' : 'border-claimondo-border'}`}>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectDiagnosebericht}
                  onChange={(e) => setSelectDiagnosebericht(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-claimondo-ondo"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <FileTextIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                    <span className="text-xs font-semibold text-claimondo-navy">Diagnosebericht / Befundbericht</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">Personenschaden</span>
                  </div>
                  <p className="text-[10px] text-claimondo-ondo mt-0.5">
                    Ärztlicher Befundbericht oder Entlassungsbericht aus der Klinik.
                  </p>
                </div>
              </label>
            </div>
          </>
        )}

        {/* Zeugenaussage — wenn zeugen=true ODER manuell aufgeklappt */}
        {sichtbarZeugen && (
          <div className={`rounded-lg border p-3 ${selectZeugenaussage ? 'border-claimondo-ondo bg-claimondo-bg/30' : 'border-claimondo-border'}`}>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectZeugenaussage}
                onChange={(e) => setSelectZeugenaussage(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-claimondo-ondo"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <UsersIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                  <span className="text-xs font-semibold text-claimondo-navy">Zeugenaussage / Zeugenkontakt</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-claimondo-shield/10 text-claimondo-navy font-medium">Zeugen</span>
                </div>
                <p className="text-[10px] text-claimondo-ondo mt-0.5">
                  Schriftliche Zeugenaussage oder Kontaktdaten des Zeugen als Scan / Foto.
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Manueller Override: alle conditional Slots zeigen — falls die
            Lead-Flags (sachschaden_flag, personenschaden_flag, zeugen) nicht
            gesetzt sind, der Dispatcher sie aber im Telefonat braucht. */}
        {!zeigeAlleSlots && (!sichtbarSachschadenFoto_initial || !sichtbarAttest_initial || !sichtbarZeugen_initial) && (
          <button
            type="button"
            onClick={() => setZeigeAlleSlots(true)}
            className="text-[11px] text-claimondo-ondo hover:text-claimondo-navy underline self-start"
          >
            + Weitere Anforderungen einblenden (Sachschaden / Personenschaden / Zeugenaussage)
          </button>
        )}

        {/* Freie „Sonstige"-Slots */}
        {sonstige.map((s) => (
          <div key={s.id} className="rounded-lg border border-claimondo-border p-3 flex items-center gap-2">
            <PlusIcon className="w-3.5 h-3.5 text-claimondo-ondo shrink-0" />
            <input
              type="text"
              value={s.label}
              onChange={(e) => updateSonstiges(s.id, e.target.value)}
              placeholder="z. B. Kaufvertrag, Rechnung ..."
              className="flex-1 text-xs px-2 py-1 border border-claimondo-border rounded focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
            />
            <button
              type="button"
              onClick={() => removeSonstiges(s.id)}
              className="text-claimondo-ondo/70 hover:text-red-600"
              title="Entfernen"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addSonstiges}
          className="w-full text-[11px] text-claimondo-ondo border border-dashed border-claimondo-ondo/50 rounded-lg py-1.5 hover:bg-[#f8f9fb] flex items-center justify-center gap-1"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Weiteres Dokument hinzufügen
        </button>
      </div>

      {/* Kanal-Auswahl + Send-Button */}
      {kannAnfragen && (
        <div className="space-y-2 pt-2 border-t border-claimondo-border">
          <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider block">
            Versandkanal
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setKanal('whatsapp')}
              disabled={!telefon}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                kanal === 'whatsapp' ? 'bg-[#25D366] text-white' : 'bg-[#f8f9fb] text-claimondo-ondo hover:bg-[#f8f9fb]'
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
                kanal === 'sms' ? 'bg-amber-500 text-white' : 'bg-[#f8f9fb] text-claimondo-ondo hover:bg-[#f8f9fb]'
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
                kanal === 'email' ? 'bg-claimondo-ondo text-white' : 'bg-[#f8f9fb] text-claimondo-ondo hover:bg-[#f8f9fb]'
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
            className="w-full px-3 py-2 rounded-lg bg-claimondo-navy text-white text-xs font-semibold hover:bg-claimondo-navy disabled:opacity-50"
          >
            {pending ? 'Sende ...' : 'Anfrage senden'}
          </button>
          {feedback && (
            <p className={`text-[11px] ${feedback.ok ? 'text-green-700' : 'text-red-600'}`}>
              {feedback.text}
            </p>
          )}
          <p className="text-[10px] text-claimondo-ondo italic">
            Der Kunde erhält einen Link und kann alle Dokumente in einem Flow hochladen.
            Antwortet er stattdessen per WhatsApp-Foto, wird das weiterhin über den
            Twilio-Webhook empfangen.
          </p>
        </div>
      )}
    </div>
  )
}
