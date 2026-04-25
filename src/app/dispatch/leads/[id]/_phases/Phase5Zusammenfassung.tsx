'use client'

// AAR-141 / W7: Phase 5 Zusammenfassung mit editierbarer Summary und
// 3-Kanal FlowLink-Versand (WhatsApp / SMS / Email). Jede Summary-Zeile hat
// einen ✏️-Button der zur jeweiligen Phase zurückspringt. Letzter Check vor
// Versand: WA-Nummer inline editierbar.

import { useState, useTransition, useEffect, useRef } from 'react'
import { useDispatchPhase } from '../_lib/phase-context'
import { sendFlowLinkMultiChannel, saveStammdaten } from '../actions'
// AAR-317: Unfallskizze-Card (Claude-API-Generator + MA-Freigabe)
import { UnfallskizzeCard } from './UnfallskizzeCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  CheckCircle2Icon,
  AlertTriangleIcon,
  PencilIcon,
  MessageSquareIcon,
  MailIcon,
  PhoneIcon,
} from 'lucide-react'

type LeadSnapshot = {
  id: string
  vorname?: string | null
  nachname?: string | null
  telefon?: string | null
  email?: string | null
  kennzeichen?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  fahrzeug_baujahr?: number | null
  service_typ?: string | null
  schadentyp?: string | null
  schuldfrage?: string | null
  schaden_sichtbar?: boolean | null
  fahrzeug_fahrbereit?: boolean | null
  personenschaden_flag?: boolean | null
  polizei_vor_ort?: boolean | null
  polizeibericht_pflicht?: boolean | null
  gegner_kennzeichen?: string | null
  gegner_versicherung?: string | null
  gegner_schadennummer?: string | null
  hat_vorschaeden?: boolean | null
  zeugen?: boolean | null
  unfallort?: string | null
  schadens_hergang?: string | null
  // AAR-317: Unfallskizze (KI-generiert)
  unfallhergang?: string | null
  unfallskizze_svg?: string | null
  unfallskizze_bestaetigt?: boolean | null
  unfallskizze_generiert_am?: string | null
}

type AktiverTermin = {
  start_zeit: string
  sv_vorname: string | null
  sv_nachname: string | null
} | null

type SummaryRow = {
  label: string
  value: string | React.ReactNode
  missing?: boolean
  jumpToPhase?: 1 | 2 | 3 | 4 | 5 | 6
}

export default function Phase5Zusammenfassung() {
  const { lead, aktiverTermin, qualification, setPhase } = useDispatchPhase()
  const l = lead as unknown as LeadSnapshot
  const termin = aktiverTermin as unknown as AktiverTermin

  const [waNummer, setWaNummer] = useState(l.telefon ?? '')
  const [email, setEmail] = useState(l.email ?? '')
  const [savingNummer, setSavingNummer] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  // AAR-179 Audit-Fix: Fehler aus saveStammdaten sichtbar machen — vorher
  // verschluckte das try/finally jeden Server-Fehler und der MA dachte der
  // Save sei erfolgreich.
  const [nummerError, setNummerError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [sendStatus, setSendStatus] = useState<{ kanal: string | null; text: string; ok: boolean }>({
    kanal: null,
    text: '',
    ok: true,
  })
  const [pending, startSend] = useTransition()

  // Redundanz-Fix: saveWaNummer + saveEmail hatten identische 14-Zeilen-
  // Struktur. Jetzt ein gemeinsamer Helper der nur einen Feld-Patch +
  // dedicated Setter-Callbacks entgegennimmt.
  function saveInlineField(
    payload: Record<string, unknown>,
    setSaving: (v: boolean) => void,
    setError: (v: string | null) => void,
    errorPrefix: string,
  ) {
    setSaving(true)
    setError(null)
    startTransition(async () => {
      try {
        const r = await saveStammdaten(lead.id, payload)
        if (!r.success) setError(r.error ?? `${errorPrefix} speichern fehlgeschlagen`)
      } catch (err) {
        setError(err instanceof Error ? err.message : `${errorPrefix} speichern fehlgeschlagen`)
      } finally {
        setSaving(false)
      }
    })
  }

  function saveWaNummer() {
    if (waNummer === (l.telefon ?? '')) return
    saveInlineField({ telefon: waNummer || null }, setSavingNummer, setNummerError, 'Telefon')
  }

  // AAR-178 P2-K: Email editierbar direkt vor dem Versand — in der Praxis
  // tippt der Kunde die Adresse am Telefon, und der MA muss sie live
  // korrigieren können bevor er Email-FlowLink abschickt.
  function saveEmail() {
    if (email === (l.email ?? '')) return
    saveInlineField({ email: email.trim() || null }, setSavingEmail, setEmailError, 'Email')
  }

  // AAR-179 Audit-Fix: Auto-Advance-Timeout wird beim Unmount/Re-Send
  // aufgeräumt damit nicht ein stale setPhase(6) den User überschreibt.
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current)
    }
  }, [])

  function send(kanal: 'whatsapp' | 'sms' | 'email') {
    if (!qualification.canSendFlowLink) {
      // AAR-269: Statt schweigend abzubrechen — Toast mit konkretem Grund.
      const missing: string[] = []
      if (!qualification.q1_schuldfrage) missing.push('Hergang/Schuldfrage')
      if (!qualification.q2_schaden) missing.push('Schaden')
      if (!qualification.q3_polizei) missing.push('Polizei-Status')
      if (!qualification.q4_schadentyp) missing.push('Schadentyp')
      if (!qualification.q5_svTermin) missing.push('SV-Termin')
      if (!qualification.q6_gegnerKz) missing.push('Gegner-KZ')
      if (!qualification.q7_fahrzeug) missing.push('Fahrzeug-Pflichtfelder')
      // AAR-305: Schadenshergang-Pflicht wenn fahrzeug_fahrbereit=true
      if (!qualification.q8_schadenhergang) missing.push('Unfallhergang (mind. 20 Zeichen, bei fahrbereitem Fahrzeug Pflicht)')
      setSendStatus({ kanal, ok: false, text: `Versand blockiert — fehlt: ${missing.join(', ')}` })
      return
    }
    // AAR-269: Sofortiges Feedback — Aaron berichtete „kein erkennbarer
    // Versand". Wir zeigen direkt einen „Sende läuft"-Status damit die
    // Reaktion sichtbar ist BEVOR der Server antwortet.
    setSendStatus({ kanal, ok: true, text: 'Sende ...' })
    if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current)
    startSend(async () => {
      try {
        const r = await sendFlowLinkMultiChannel(lead.id, kanal, waNummer || null)
        setSendStatus({
          kanal,
          ok: r.success,
          text: r.success ? 'FlowLink versendet' : r.error ?? 'Versand fehlgeschlagen (kein Detail)',
        })
        if (r.success) {
          advanceTimeoutRef.current = setTimeout(() => setPhase(6), 600)
        }
      } catch (err) {
        // AAR-269: Action könnte werfen wenn Twilio-Network/Timeout — fangen
        // damit der MA nicht im stale 'Sende ...' hängen bleibt.
        setSendStatus({
          kanal,
          ok: false,
          text: err instanceof Error ? `Exception: ${err.message}` : 'Unbekannter Fehler beim Versand',
        })
      }
    })
  }

  function fmt(v: boolean | null | undefined, yes = 'Ja', no = 'Nein'): string {
    if (v === true) return yes
    if (v === false) return no
    return '—'
  }

  const schuldfrageLabel =
    l.schuldfrage === 'gegner' ? 'Gegner hat verursacht'
    : l.schuldfrage === 'unklar' ? 'Unklar / Teilbeteiligung'
    : l.schuldfrage === 'eigenverantwortung' ? 'Eigenverantwortung'
    : '—'

  const schadenDetail = [
    l.schaden_sichtbar === true ? 'sichtbar' : l.schaden_sichtbar === false ? 'nicht sichtbar' : '—',
    l.fahrzeug_fahrbereit === true ? 'fahrbereit' : l.fahrzeug_fahrbereit === false ? 'nicht fahrbereit' : null,
    l.personenschaden_flag === true ? 'Personenschaden' : null,
  ].filter(Boolean).join(' · ')

  const polizeiDetail =
    l.polizei_vor_ort === true
      ? `Ja${l.polizeibericht_pflicht === true ? ', Bericht vorhanden' : ', nur Aktenzeichen'}`
      : l.polizei_vor_ort === false ? 'Nein' : '—'

  const terminDetail = termin
    ? `${new Date(termin.start_zeit).toLocaleDateString('de-DE')} ${new Date(termin.start_zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} — ${termin.sv_vorname ?? ''} ${termin.sv_nachname ?? ''}`.trim()
    : '—'

  const fahrzeugText = [l.fahrzeug_hersteller, l.fahrzeug_modell].filter(Boolean).join(' ') || '—'

  const rows: SummaryRow[] = [
    {
      label: 'Hergang + Verantwortlichkeit',
      value: schuldfrageLabel,
      missing: !qualification.q1_schuldfrage,
      jumpToPhase: 1,
    },
    {
      label: 'Schaden / Fahrbereit / Personenschaden',
      value: schadenDetail || '—',
      missing: !qualification.q2_schaden,
      jumpToPhase: 1,
    },
    {
      label: 'Polizei vor Ort + Bericht',
      value: polizeiDetail,
      missing: !qualification.q3_polizei,
      jumpToPhase: 1,
    },
    {
      label: 'Schadentyp',
      value: l.schadentyp ?? '—',
      missing: !qualification.q4_schadentyp,
      jumpToPhase: 3,
    },
    {
      label: 'SV-Termin + Adresse',
      value: terminDetail,
      missing: !qualification.q5_svTermin,
      jumpToPhase: 2,
    },
    {
      label: 'Service-Typ',
      value: l.service_typ === 'nur_gutachter' ? 'Pfad B — Nur SV' : 'Pfad A — Komplett',
      jumpToPhase: 2,
    },
    {
      label: 'Eigenes KZ / Fahrzeug / Baujahr',
      value: `${l.kennzeichen ?? '—'} / ${fahrzeugText} / ${l.fahrzeug_baujahr ?? '—'}`,
      // AAR-181: Baujahr als Pflichtfeld
      missing: !qualification.q7_fahrzeug,
      jumpToPhase: 4,
    },
    {
      label: 'Gegner-KZ / VS / Schadennr',
      value: `${l.gegner_kennzeichen ?? '—'} / ${l.gegner_versicherung ?? '—'} / ${l.gegner_schadennummer ?? '—'}`,
      missing: !qualification.q6_gegnerKz,
      jumpToPhase: 4,
    },
    {
      label: 'Vorschäden',
      value: fmt(l.hat_vorschaeden),
      jumpToPhase: 4,
    },
    {
      label: 'Zeugen',
      value: fmt(l.zeugen),
      jumpToPhase: 4,
    },
    {
      // AAR-693: bevorzugt unfallhergang aus Phase 1 anzeigen, fallback auf
      // schadens_hergang. q8_schadenhergang akzeptiert beide Felder.
      label: 'Unfallhergang (Pflicht bei fahrbereitem Fahrzeug)',
      value: l.fahrzeug_fahrbereit !== true
        ? 'Nicht fahrbereit — kein Pflichtfeld'
        : (l.unfallhergang?.trim() || l.schadens_hergang?.trim() || '—'),
      missing: !qualification.q8_schadenhergang,
      jumpToPhase: 1,
    },
    {
      label: 'Unfallort',
      value: l.unfallort ?? '—',
      missing: !l.unfallort,
      jumpToPhase: 1,
    },
  ]

  // AAR-146: Soft-Gate für Kasko-Risiko. Die alte Haftpflicht-Hard-Gate ist
  // entfallen; wenn der MA „unklar" wählt, ist die Chance auf einen Kasko-Fall
  // erhöht. Keine automatische Blockade (Spec-Vorgabe), aber ein sichtbarer
  // Reminder vor dem FlowLink-Versand.
  const schuldfrageUnklar = l.schuldfrage === 'unklar'

  return (
    <div className="space-y-4">
      {schuldfrageUnklar && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-900">
              Schuldfrage unklar — Haftpflicht-Check
            </p>
          </div>
          <p className="text-xs text-amber-800">
            Ist sichergestellt, dass es ein Haftpflichtschaden der Gegenseite ist? Wenn Kasko
            oder eigene Versicherung zuständig ist, jetzt über die Sidebar
            <strong> „Disqualifizieren"</strong> mit Grund <em>Kasko / eigene Versicherung</em>.
          </p>
        </div>
      )}

      {/* Summary */}
      <div className="bg-white border border-claimondo-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2Icon className="w-4 h-4 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">Zusammenfassung — letzter Check</h2>
          <StatusBadge tone={qualification.canSendFlowLink ? 'success' : 'warning'} className="ml-auto">
            {qualification.completedCount}/8 Bedingungen
          </StatusBadge>
        </div>
        <div className="divide-y divide-claimondo-border">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start gap-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 flex items-center gap-1">
                  {r.missing && <AlertTriangleIcon className="w-3 h-3 text-amber-500" />}
                  {r.label}
                </p>
                <p className={`text-sm ${r.missing ? 'text-amber-700 font-medium' : 'text-claimondo-navy'}`}>
                  {r.value}
                </p>
              </div>
              {r.jumpToPhase && (
                <button
                  type="button"
                  onClick={() => setPhase(r.jumpToPhase!)}
                  className="text-claimondo-ondo hover:text-[#3a6290] p-1"
                  title={`Zu Phase ${r.jumpToPhase} springen`}
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* WA-Nummer + Email Inline-Edit.
          AAR-348: Explizite gelbe Warnbanner wenn Tel/Email leer sind —
          zuvor wurden die Buttons nur stumm disabled, der MA hatte keinen
          Hinweis WARUM der Kanal nicht verfügbar ist. */}
      <div className="bg-white border border-claimondo-border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <PhoneIcon className="w-4 h-4 text-claimondo-ondo/70" />
          <h3 className="text-sm font-semibold text-claimondo-navy">Kontaktdaten für FlowLink-Versand</h3>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo block mb-1">
            WhatsApp / SMS-Nummer
          </label>
          <input
            type="tel"
            value={waNummer}
            onChange={(e) => setWaNummer(e.target.value)}
            onBlur={saveWaNummer}
            placeholder="+49 170 1234567"
            className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm"
          />
          <p className={`text-[10px] mt-0.5 ${nummerError ? 'text-red-600' : 'text-claimondo-ondo/70'}`}>
            {nummerError ? nummerError : savingNummer ? 'Speichern ...' : 'Änderung wird beim Verlassen des Feldes gespeichert.'}
          </p>
        </div>
        {/* AAR-178 P2-K: Email inline editierbar */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo block mb-1">
            Email für FlowLink (optional)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={saveEmail}
            placeholder="name@example.de"
            className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm"
          />
          <p className={`text-[10px] mt-0.5 ${emailError ? 'text-red-600' : 'text-claimondo-ondo/70'}`}>
            {emailError ? emailError : savingEmail ? 'Speichern ...' : 'Änderung wird beim Verlassen des Feldes gespeichert.'}
          </p>
        </div>
        {/* AAR-348: Gelbe Warnbanner wenn Felder leer — macht dem MA klar,
            dass er den betroffenen Kanal nicht versenden kann. */}
        {!waNummer.trim() && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-800">
              Keine Telefonnummer hinterlegt — FlowLink kann nicht per WhatsApp/SMS versendet werden.
            </p>
          </div>
        )}
        {!email.trim() && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-800">
              Keine Email hinterlegt — FlowLink kann nicht per Email versendet werden.
            </p>
          </div>
        )}
      </div>

      {/* AAR-317: Unfallskizze (KI-generiert) — optional, muss nicht freigegeben
          sein bevor der FlowLink versendet wird. */}
      <UnfallskizzeCard
        leadId={l.id}
        unfallhergang={l.unfallhergang ?? null}
        initialSvg={l.unfallskizze_svg ?? null}
        initialBestaetigt={l.unfallskizze_bestaetigt ?? false}
        initialGeneriertAm={l.unfallskizze_generiert_am ?? null}
      />

      {/* 3 Versand-Buttons */}
      <div className="bg-white border border-claimondo-border rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-claimondo-navy">Versandweg wählen</h3>
        {!qualification.canSendFlowLink && (
          <p className="text-[11px] text-amber-700 flex items-start gap-1">
            <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Erst nach vollständiger Qualifizierung + Terminreservierung versendbar.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            disabled={pending || !qualification.canSendFlowLink || !waNummer}
            onClick={() => send('whatsapp')}
            title={!waNummer ? 'Bitte WhatsApp-Nummer eintragen' : !qualification.canSendFlowLink ? 'Erst alle 7/7 Bedingungen erfüllen' : undefined}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#1fa855] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MessageSquareIcon className="w-4 h-4" />
            {pending && sendStatus.kanal === 'whatsapp' ? 'Sende ...' : 'WhatsApp'}
          </button>
          <button
            type="button"
            disabled={pending || !qualification.canSendFlowLink || !waNummer}
            onClick={() => send('sms')}
            title={!waNummer ? 'Bitte Telefonnummer eintragen' : !qualification.canSendFlowLink ? 'Erst alle 7/7 Bedingungen erfüllen' : undefined}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PhoneIcon className="w-4 h-4" />
            {pending && sendStatus.kanal === 'sms' ? 'Sende ...' : 'SMS'}
          </button>
          <button
            type="button"
            disabled={pending || !qualification.canSendFlowLink || !email.trim()}
            onClick={() => send('email')}
            title={!email.trim() ? 'Bitte Email-Adresse eintragen' : !qualification.canSendFlowLink ? 'Erst alle 7/7 Bedingungen erfüllen' : undefined}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-claimondo-ondo text-white text-sm font-bold hover:bg-[#3a6290] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MailIcon className="w-4 h-4" />
            {pending && sendStatus.kanal === 'email' ? 'Sende ...' : 'Email'}
          </button>
        </div>
        {sendStatus.kanal && (
          <div className={`text-xs px-3 py-2 rounded-lg ${
            sendStatus.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {sendStatus.kanal}: {sendStatus.text}
          </div>
        )}
      </div>
    </div>
  )
}
