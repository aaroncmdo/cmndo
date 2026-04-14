'use client'

// AAR-108: Manuelle Trigger fuer alle 21 LexDrive-Events aus der Fallakte.
import { useState, useTransition } from 'react'
import {
  CheckCircleIcon, FileTextIcon, AlertTriangleIcon, EuroIcon,
  ClockIcon, GavelIcon, XCircleIcon, ScaleIcon, EyeIcon, CircleIcon, XIcon,
  type LucideIcon,
} from 'lucide-react'
import { triggerLexDriveEventManually } from '../lexdrive-actions'
import type { LexDriveEvent } from '@/lib/lexdrive/process-event'

type EventDef = {
  id: LexDriveEvent
  label: string
  icon: LucideIcon
  fields: Array<'datum' | 'betrag' | 'grund' | 'kuerzungs_betrag' | 'anerkannt_betrag' | 'frist_bis' | 'zahlungsweg' | 'beschreibung'>
}

const EVENT_GROUPS: { label: string; events: EventDef[] }[] = [
  {
    label: 'Bestaetigungen',
    events: [
      { id: 'vollmacht_bestaetigt', label: 'Vollmacht bestaetigt', icon: CheckCircleIcon, fields: [] },
      { id: 'akte_eingegangen_bestaetigt', label: 'Akte eingegangen', icon: FileTextIcon, fields: [] },
    ],
  },
  {
    label: 'Anschlussschreiben',
    events: [
      { id: 'as_versendet', label: 'AS versendet', icon: FileTextIcon, fields: ['datum'] },
      { id: 'mahnung_versendet', label: 'Mahnung versendet', icon: AlertTriangleIcon, fields: ['datum'] },
    ],
  },
  {
    label: 'VS-Reaktion',
    events: [
      { id: 'vs_reguliert_voll', label: 'VS reguliert voll', icon: CheckCircleIcon, fields: ['datum', 'betrag'] },
      { id: 'vs_kuerzt', label: 'VS kuerzt', icon: AlertTriangleIcon, fields: ['datum', 'kuerzungs_betrag', 'anerkannt_betrag'] },
      { id: 'vs_ablehnung', label: 'VS lehnt ab', icon: XCircleIcon, fields: ['datum', 'grund'] },
      { id: 'vs_fristverlaengerung', label: 'VS Fristverlaengerung', icon: ClockIcon, fields: ['frist_bis'] },
      { id: 'vs_nachbesichtigung_angefordert', label: 'VS Nachbesichtigung angef.', icon: EyeIcon, fields: ['datum'] },
      { id: 'vs_nachbesichtigung_ergebnis', label: 'Nachbesichtigung Ergebnis', icon: EyeIcon, fields: ['datum', 'beschreibung'] },
    ],
  },
  {
    label: 'Ruegen',
    events: [
      { id: 'ruege_1_gesendet', label: 'Ruege 1 gesendet', icon: AlertTriangleIcon, fields: ['datum'] },
      { id: 'ruege_1_anerkannt', label: 'Ruege 1 anerkannt', icon: CheckCircleIcon, fields: [] },
      { id: 'ruege_2_gesendet', label: 'Ruege 2 gesendet', icon: AlertTriangleIcon, fields: ['datum'] },
      { id: 'ruege_2_anerkannt', label: 'Ruege 2 anerkannt', icon: CheckCircleIcon, fields: [] },
      { id: 'ruege_abgelehnt', label: 'Ruege abgelehnt', icon: XCircleIcon, fields: ['grund'] },
    ],
  },
  {
    label: 'Zahlung & Klage',
    events: [
      { id: 'regulierung_angekuendigt', label: 'Regulierung angekuendigt', icon: CheckCircleIcon, fields: ['datum'] },
      { id: 'zahlung_eingegangen', label: 'Zahlung eingegangen', icon: EuroIcon, fields: ['datum', 'betrag', 'zahlungsweg'] },
      { id: 'klage_eingereicht', label: 'Klage eingereicht', icon: GavelIcon, fields: ['datum'] },
      { id: 'technische_stellungnahme_benoetigt', label: 'Tech. Stellungnahme noetig', icon: ScaleIcon, fields: ['beschreibung'] },
    ],
  },
]

const FIELD_LABELS: Record<string, string> = {
  datum: 'Datum',
  betrag: 'Betrag (EUR)',
  grund: 'Grund',
  kuerzungs_betrag: 'Kuerzungs-Betrag (EUR)',
  anerkannt_betrag: 'Anerkannter Betrag (EUR)',
  frist_bis: 'Frist bis',
  zahlungsweg: 'Zahlungsweg',
  beschreibung: 'Beschreibung',
}

export default function LexDriveTriggerPanel({ fallId }: { fallId: string }) {
  const [activeEvent, setActiveEvent] = useState<EventDef | null>(null)
  const [payload, setPayload] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  function handleSubmit() {
    if (!activeEvent) return
    setFeedback(null)
    startTransition(async () => {
      const converted: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(payload)) {
        if (!v) continue
        if (k === 'betrag' || k === 'kuerzungs_betrag' || k === 'anerkannt_betrag') {
          converted[k] = Number(v)
        } else {
          converted[k] = v
        }
      }
      const result = await triggerLexDriveEventManually(fallId, activeEvent.id, converted)
      if (result.success) {
        setFeedback({ ok: true, msg: `Event "${activeEvent.label}" ausgeloest.` })
        setActiveEvent(null)
        setPayload({})
      } else {
        setFeedback({ ok: false, msg: result.error ?? 'Fehler' })
      }
      setTimeout(() => setFeedback(null), 5000)
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#0D1B3E]">LexDrive Events manuell ausloesen</h3>
        <span className="text-[10px] uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
          Manueller Modus
        </span>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        Bis die LexDrive-Webhook-Integration steht: alle 21 Events hier manuell ausloesen. Trigger-Logik
        (Status, Felder, WhatsApp, Timeline) ist identisch zum Webhook.
      </p>

      {EVENT_GROUPS.map(group => (
        <div key={group.label}>
          <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider mb-2">{group.label}</p>
          <div className="grid grid-cols-2 gap-2">
            {group.events.map(ev => {
              const Icon = ev.icon
              return (
                <button
                  key={ev.id}
                  onClick={() => { setActiveEvent(ev); setPayload({}) }}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-[#4573A2] hover:text-white rounded-lg transition-colors text-left"
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{ev.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {feedback && (
        <p className={`text-xs px-3 py-2 rounded ${feedback.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {feedback.msg}
        </p>
      )}

      {activeEvent && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#0D1B3E]">Ausloesen: {activeEvent.label}</h3>
              <button onClick={() => setActiveEvent(null)} className="text-gray-400 hover:text-gray-600">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {activeEvent.fields.length === 0 && (
              <p className="text-sm text-gray-500">
                <CircleIcon className="w-3 h-3 inline-block mr-1" />
                Keine zusaetzlichen Angaben noetig.
              </p>
            )}

            {activeEvent.fields.map(field => (
              <div key={field}>
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  {FIELD_LABELS[field]}
                </label>
                {field === 'grund' || field === 'beschreibung' ? (
                  <textarea
                    value={payload[field] ?? ''}
                    onChange={e => setPayload({ ...payload, [field]: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#4573A2]"
                  />
                ) : (
                  <input
                    type={field === 'datum' || field === 'frist_bis' ? 'date' : field.includes('betrag') ? 'number' : 'text'}
                    value={payload[field] ?? ''}
                    onChange={e => setPayload({ ...payload, [field]: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#4573A2]"
                  />
                )}
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setActiveEvent(null)} className="flex-1 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Abbrechen
              </button>
              <button onClick={handleSubmit} disabled={pending}
                className="flex-1 py-2.5 text-sm bg-[#4573A2] text-white rounded-lg disabled:opacity-50 hover:bg-[#0D1B3E]">
                {pending ? 'Laedt...' : 'Ausloesen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
