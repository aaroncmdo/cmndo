'use client'

// AAR-141 / W7: Phase 5 Zusammenfassung mit editierbarer Summary und
// 3-Kanal FlowLink-Versand (WhatsApp / SMS / Email). Jede Summary-Zeile hat
// einen ✏️-Button der zur jeweiligen Phase zurückspringt. Letzter Check vor
// Versand: WA-Nummer inline editierbar.

import { useState, useTransition } from 'react'
import { useDispatchPhase } from '../lib/phase-context'
import { sendFlowLinkMultiChannel, saveStammdaten } from '../actions'
import {
  CheckCircle2Icon,
  AlertTriangleIcon,
  PencilIcon,
  MessageSquareIcon,
  MailIcon,
  PhoneIcon,
} from 'lucide-react'

type LeadSnapshot = {
  vorname?: string | null
  nachname?: string | null
  telefon?: string | null
  email?: string | null
  kennzeichen?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
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
  const [savingNummer, setSavingNummer] = useState(false)
  const [, startTransition] = useTransition()
  const [sendStatus, setSendStatus] = useState<{ kanal: string | null; text: string; ok: boolean }>({
    kanal: null,
    text: '',
    ok: true,
  })
  const [pending, startSend] = useTransition()

  function saveWaNummer() {
    if (waNummer === (l.telefon ?? '')) return
    setSavingNummer(true)
    startTransition(async () => {
      try {
        await saveStammdaten(lead.id, { telefon: waNummer || null })
      } finally {
        // Spinner immer zurücksetzen — auch wenn saveStammdaten throwt, sonst
        // bleibt der „Speichern..."-Hinweis dauerhaft stehen.
        setSavingNummer(false)
      }
    })
  }

  function send(kanal: 'whatsapp' | 'sms' | 'email') {
    if (!qualification.canSendFlowLink) return
    startSend(async () => {
      const r = await sendFlowLinkMultiChannel(lead.id, kanal, waNummer || null)
      setSendStatus({
        kanal,
        ok: r.success,
        text: r.success ? 'FlowLink versendet' : r.error ?? 'Fehler',
      })
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
      label: 'Eigenes KZ / Fahrzeug',
      value: `${l.kennzeichen ?? '—'} / ${fahrzeugText}`,
      missing: !l.kennzeichen || !l.fahrzeug_hersteller,
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
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2Icon className="w-4 h-4 text-[#4573A2]" />
          <h2 className="text-sm font-semibold text-gray-900">Zusammenfassung — letzter Check</h2>
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium ${
            qualification.canSendFlowLink
              ? 'bg-green-100 text-green-700'
              : 'bg-amber-100 text-amber-700'
          }`}>
            {qualification.completedCount}/6 Bedingungen
          </span>
        </div>
        <div className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start gap-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 flex items-center gap-1">
                  {r.missing && <AlertTriangleIcon className="w-3 h-3 text-amber-500" />}
                  {r.label}
                </p>
                <p className={`text-sm ${r.missing ? 'text-amber-700 font-medium' : 'text-gray-900'}`}>
                  {r.value}
                </p>
              </div>
              {r.jumpToPhase && (
                <button
                  type="button"
                  onClick={() => setPhase(r.jumpToPhase!)}
                  className="text-[#4573A2] hover:text-[#3a6290] p-1"
                  title={`Zu Phase ${r.jumpToPhase} springen`}
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* WA-Nummer Inline-Edit */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
        <div className="flex items-center gap-2">
          <PhoneIcon className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">WhatsApp-Nummer für Versand</h3>
        </div>
        <input
          type="tel"
          value={waNummer}
          onChange={(e) => setWaNummer(e.target.value)}
          onBlur={saveWaNummer}
          placeholder="+49 170 1234567"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        <p className="text-[10px] text-gray-400">
          {savingNummer ? 'Speichern ...' : 'Änderung wird beim Verlassen des Feldes gespeichert.'}
        </p>
      </div>

      {/* 3 Versand-Buttons */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Versandweg wählen</h3>
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
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#1fa855] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MessageSquareIcon className="w-4 h-4" />
            WhatsApp
          </button>
          <button
            type="button"
            disabled={pending || !qualification.canSendFlowLink || !waNummer}
            onClick={() => send('sms')}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PhoneIcon className="w-4 h-4" />
            SMS
          </button>
          <button
            type="button"
            disabled={pending || !qualification.canSendFlowLink || !l.email}
            onClick={() => send('email')}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#4573A2] text-white text-sm font-bold hover:bg-[#3a6290] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MailIcon className="w-4 h-4" />
            Email
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
