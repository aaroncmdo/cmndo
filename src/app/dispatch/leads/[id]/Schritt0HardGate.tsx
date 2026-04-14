'use client'

import { useState, useTransition } from 'react'
import { saveHardGate, type HardGateData } from './actions'
import { computeHardGateStatus } from './hard-gate-utils'
import { CheckCircleIcon, AlertTriangleIcon, XCircleIcon, InfoIcon } from 'lucide-react'

type Lead = {
  id: string
  unfallhergang?: string | null
  schuldfrage?: 'gegner' | 'unklar' | 'eigenverantwortung' | null
  aufklaerung_teilschuld_bestaetigt?: boolean | null
  schaden_sichtbar?: boolean | null
  personenschaden_flag?: boolean | null
  mietwagen_flag?: boolean | null
  nutzungsausfall?: boolean | null
  hat_haftpflicht?: boolean | null
  qualifizierungs_phase?: string | null
  disqualifikations_grund?: string | null
}

export default function Schritt0HardGate({ lead }: { lead: Lead }) {
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<HardGateData>({
    unfallhergang: lead.unfallhergang ?? '',
    schuldfrage: lead.schuldfrage ?? undefined,
    aufklaerung_teilschuld_bestaetigt: lead.aufklaerung_teilschuld_bestaetigt ?? false,
    schaden_sichtbar: lead.schaden_sichtbar ?? undefined,
    personenschaden_flag: lead.personenschaden_flag ?? false,
    mietwagen_flag: lead.mietwagen_flag ?? false,
    nutzungsausfall: lead.nutzungsausfall ?? false,
    hat_haftpflicht: lead.hat_haftpflicht ?? undefined,
  })
  const [toast, setToast] = useState('')

  const status = computeHardGateStatus({ ...lead, ...draft })

  function save() {
    startTransition(async () => {
      const r = await saveHardGate(lead.id, draft)
      if (r.success) {
        setToast(r.disqualifiziert ? `Disqualifiziert: ${r.grund}` : 'Gespeichert')
      } else {
        setToast(r.error ?? 'Fehler')
      }
      setTimeout(() => setToast(''), 3000)
    })
  }

  if (status.disqualifiziert) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
        <XCircleIcon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-800">Lead disqualifiziert</p>
          <p className="text-xs text-red-700 mt-0.5">{lead.disqualifikations_grund ?? 'Hard-Gate-Check fehlgeschlagen'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Schritt 0: Hard Gate</h2>
        {status.allComplete ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
            <CheckCircleIcon className="w-3 h-3" /> Freigegeben
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            {[status.q1Complete, status.q2Complete, status.q3Complete].filter(Boolean).length}/3
          </span>
        )}
      </div>

      {/* Q1: Hergang + Schuldfrage */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${status.q1Complete ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>1</span>
          <h3 className="text-xs font-semibold text-gray-700">Unfallhergang & Aufklärung</h3>
        </div>
        <textarea
          value={draft.unfallhergang ?? ''}
          onChange={e => setDraft(d => ({ ...d, unfallhergang: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm h-20 resize-none"
          placeholder="Was ist passiert? (offene Beschreibung — niemals 'Schuld' sagen)"
        />
        <div className="flex gap-2">
          {([
            { v: 'gegner', label: 'Gegner alleine verantwortlich' },
            { v: 'unklar', label: 'Unklar / Teilbeteiligung' },
            { v: 'eigenverantwortung', label: 'Eigenverantwortung' },
          ] as const).map(o => (
            <button
              key={o.v}
              type="button"
              onClick={() => setDraft(d => ({ ...d, schuldfrage: o.v }))}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                draft.schuldfrage === o.v ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {draft.schuldfrage === 'unklar' && (
          <label className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.aufklaerung_teilschuld_bestaetigt ?? false}
              onChange={e => setDraft(d => ({ ...d, aufklaerung_teilschuld_bestaetigt: e.target.checked }))}
              className="mt-0.5"
            />
            <span>
              <strong>Aufklärung Teilschuld:</strong> Ich habe den Kunden über die Konsequenzen einer Falschaussage aufgeklärt
              (Strafanzeige, Versagung der Versicherungsleistung).
            </span>
          </label>
        )}
        {draft.schuldfrage === 'eigenverantwortung' && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
            <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Eigenverantwortung = Kasko-Fall. Lead wird automatisch disqualifiziert.</span>
          </p>
        )}
      </div>

      {/* Q2: Schaden */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${status.q2Complete ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>2</span>
          <h3 className="text-xs font-semibold text-gray-700">Sichtbarer Schaden am Fahrzeug?</h3>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(d => ({ ...d, schaden_sichtbar: true }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.schaden_sichtbar === true ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}>Ja</button>
          <button type="button" onClick={() => setDraft(d => ({ ...d, schaden_sichtbar: false }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.schaden_sichtbar === false ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}>Nein</button>
        </div>
        {/* Nachfrage-Zweig */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <label className="flex items-center gap-1.5 text-[10px] text-gray-700 cursor-pointer">
            <input type="checkbox" checked={draft.personenschaden_flag ?? false} onChange={e => setDraft(d => ({ ...d, personenschaden_flag: e.target.checked }))} className="w-3.5 h-3.5" />
            Personenschaden
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-gray-700 cursor-pointer">
            <input type="checkbox" checked={draft.mietwagen_flag ?? false} onChange={e => setDraft(d => ({ ...d, mietwagen_flag: e.target.checked }))} className="w-3.5 h-3.5" />
            Mietwagen
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-gray-700 cursor-pointer">
            <input type="checkbox" checked={draft.nutzungsausfall ?? false} onChange={e => setDraft(d => ({ ...d, nutzungsausfall: e.target.checked }))} className="w-3.5 h-3.5" />
            Nutzungsausfall
          </label>
        </div>
      </div>

      {/* Q3: Haftpflicht */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${status.q3Complete ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>3</span>
          <h3 className="text-xs font-semibold text-gray-700">Hat der Gegner eine Haftpflichtversicherung?</h3>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(d => ({ ...d, hat_haftpflicht: true }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.hat_haftpflicht === true ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}>Ja</button>
          <button type="button" onClick={() => setDraft(d => ({ ...d, hat_haftpflicht: false }))} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${draft.hat_haftpflicht === false ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600'}`}>Nein</button>
        </div>
        {draft.hat_haftpflicht === false && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
            <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" /> Keine Haftpflicht = kein Anspruch. Lead wird disqualifiziert.
          </p>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`text-xs px-3 py-2 rounded-lg ${toast === 'Gespeichert' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{toast}</div>
      )}

      <button
        disabled={pending}
        onClick={save}
        className="w-full px-4 py-2.5 rounded-xl bg-[#4573A2] text-white text-sm font-medium hover:bg-[#3a6290] disabled:opacity-50"
      >
        {pending ? 'Speichern...' : 'Speichern'}
      </button>

      {!status.allComplete && (
        <p className="text-[10px] text-gray-500 flex items-center gap-1">
          <InfoIcon className="w-3 h-3" /> Alle 3 Fragen müssen beantwortet sein bevor Schritt 1 freigeschaltet wird.
        </p>
      )}
    </div>
  )
}
