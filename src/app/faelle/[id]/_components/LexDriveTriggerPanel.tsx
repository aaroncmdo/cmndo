'use client'

// AAR-108 / AAR-540 (C3): Endpoint-Register — manuelle Trigger für alle
// 24+ LexDrive/Manual-Events aus der Fallakte. ✓/⏳-Status-Badges lesen
// aus webhook_events; special-Events (manual_status_override) nicht sichtbar.
import { useState, useTransition } from 'react'
import {
  CheckCircleIcon, FileTextIcon, AlertTriangleIcon, EuroIcon,
  ClockIcon, GavelIcon, XCircleIcon, ScaleIcon, EyeIcon, CircleIcon, XIcon,
  HandshakeIcon, FilmIcon, UsersIcon, PhoneIcon, UploadIcon, ShieldAlertIcon,
  type LucideIcon,
} from 'lucide-react'
import { triggerLexDriveEventManually } from '../lexdrive-actions'
import type { LexDriveEvent } from '@/lib/lexdrive/process-event'
import { Modal } from '@/components/primitives/Modal'
import { StatusBadge } from '@/components/shared/StatusBadge'

type FieldId =
  | 'datum' | 'betrag' | 'grund' | 'kuerzungs_betrag' | 'anerkannt_betrag'
  | 'frist_bis' | 'zahlungsweg' | 'beschreibung'
  | 'vs_kuerzungs_typ' | 'vs_quote_prozent' | 'vs_quote_grund'
  | 'filmcheck_am' | 'eskalation_stufe' | 'ergebnis' | 'naechste_aktion'
  | 'auszahlung_kunde_betrag' | 'auszahlung_kunde_eingegangen_am'
  | 'auszahlung_gutachter_eingegangen_am' | 'upload_url' | 'notiz_sv'

type EventDef = {
  id: LexDriveEvent
  label: string
  icon: LucideIcon
  fields: FieldId[]
}

const EVENT_GROUPS: { label: string; events: EventDef[] }[] = [
  {
    label: 'Bestätigungen',
    events: [
      { id: 'vollmacht_bestaetigt', label: 'Vollmacht bestätigt', icon: CheckCircleIcon, fields: [] },
      { id: 'akte_eingegangen_bestaetigt', label: 'Akte eingegangen', icon: FileTextIcon, fields: [] },
      { id: 'kb_filmcheck_bestanden', label: 'Filmcheck bestanden', icon: FilmIcon, fields: ['filmcheck_am', 'beschreibung'] },
    ],
  },
  {
    label: 'Anspruchsschreiben',
    events: [
      { id: 'as_versendet', label: 'AS versendet', icon: FileTextIcon, fields: ['datum'] },
      { id: 'mahnung_versendet', label: 'Mahnung versendet', icon: AlertTriangleIcon, fields: ['datum'] },
    ],
  },
  {
    label: 'VS-Reaktion',
    events: [
      { id: 'vs_reguliert_voll', label: 'VS reguliert voll', icon: CheckCircleIcon, fields: ['datum', 'betrag'] },
      { id: 'vs_kuerzt', label: 'VS kürzt', icon: AlertTriangleIcon, fields: ['datum', 'vs_kuerzungs_typ', 'kuerzungs_betrag', 'anerkannt_betrag', 'grund'] },
      { id: 'vs_quotiert', label: 'VS quotiert', icon: HandshakeIcon, fields: ['datum', 'vs_quote_prozent', 'vs_quote_grund'] },
      { id: 'vs_quote_akzeptiert', label: 'VS-Quote akzeptiert', icon: CheckCircleIcon, fields: ['datum', 'beschreibung'] },
      { id: 'vs_ablehnung', label: 'VS lehnt ab', icon: XCircleIcon, fields: ['datum', 'grund'] },
      { id: 'vs_fristverlaengerung', label: 'VS Fristverlängerung', icon: ClockIcon, fields: ['frist_bis'] },
      { id: 'vs_nachbesichtigung_angefordert', label: 'VS Nachbesichtigung angef.', icon: EyeIcon, fields: ['datum'] },
      { id: 'vs_nachbesichtigung_ergebnis', label: 'Nachbesichtigung Ergebnis', icon: EyeIcon, fields: ['datum', 'beschreibung'] },
    ],
  },
  {
    label: 'Eskalation',
    events: [
      { id: 'vs_eskalation_kontakt_ergebnis', label: 'VS-Eskalation Ergebnis', icon: PhoneIcon, fields: ['eskalation_stufe', 'ergebnis', 'naechste_aktion'] },
    ],
  },
  {
    label: 'Rügen',
    events: [
      { id: 'ruege_1_gesendet', label: 'Rüge 1 gesendet', icon: AlertTriangleIcon, fields: ['datum'] },
      { id: 'ruege_1_anerkannt', label: 'Rüge 1 anerkannt', icon: CheckCircleIcon, fields: [] },
      { id: 'ruege_2_gesendet', label: 'Rüge 2 gesendet', icon: AlertTriangleIcon, fields: ['datum'] },
      { id: 'ruege_2_anerkannt', label: 'Rüge 2 anerkannt', icon: CheckCircleIcon, fields: [] },
      { id: 'ruege_abgelehnt', label: 'Rüge abgelehnt', icon: XCircleIcon, fields: ['grund'] },
    ],
  },
  {
    label: 'Stellungnahme + Konfrontation',
    events: [
      { id: 'technische_stellungnahme_benoetigt', label: 'Tech. Stellungnahme nötig', icon: ScaleIcon, fields: ['beschreibung'] },
      { id: 'sv_stellungnahme_eingereicht', label: 'SV-Stellungnahme eingereicht', icon: UploadIcon, fields: ['upload_url', 'notiz_sv'] },
      { id: 'sv_konfrontation_anfrage_versendet', label: 'SV-Konfrontation angefragt', icon: ShieldAlertIcon, fields: ['datum'] },
      { id: 'sv_konfrontation_bestaetigt', label: 'SV-Konfrontation bestätigt', icon: CheckCircleIcon, fields: ['datum'] },
      { id: 'sv_konfrontation_abgelehnt', label: 'SV-Konfrontation abgelehnt', icon: XCircleIcon, fields: ['grund'] },
    ],
  },
  {
    label: 'Kunde-Nachbesichtigung',
    events: [
      { id: 'kunde_nachbesichtigung_termine_eingereicht', label: 'Kunde-Termine eingereicht', icon: UsersIcon, fields: ['datum', 'beschreibung'] },
    ],
  },
  {
    label: 'Zahlung + Klage',
    events: [
      { id: 'regulierung_angekuendigt', label: 'Regulierung angekündigt', icon: CheckCircleIcon, fields: ['datum'] },
      { id: 'zahlung_eingegangen', label: 'Zahlung eingegangen', icon: EuroIcon, fields: ['datum', 'betrag', 'zahlungsweg'] },
      { id: 'auszahlung_split_eingegangen', label: 'Auszahlung-Split eingegangen', icon: EuroIcon, fields: ['auszahlung_kunde_betrag', 'auszahlung_kunde_eingegangen_am', 'auszahlung_gutachter_eingegangen_am', 'zahlungsweg'] },
      { id: 'klage_eingereicht', label: 'Klage eingereicht', icon: GavelIcon, fields: ['datum'] },
      { id: 'fall_geschlossen', label: 'Fall geschlossen', icon: CheckCircleIcon, fields: ['datum', 'grund'] },
    ],
  },
]

const FIELD_LABELS: Record<FieldId, string> = {
  datum: 'Datum',
  betrag: 'Betrag (EUR)',
  grund: 'Grund',
  kuerzungs_betrag: 'Kürzungs-Betrag (EUR)',
  anerkannt_betrag: 'Anerkannter Betrag (EUR)',
  frist_bis: 'Frist bis',
  zahlungsweg: 'Zahlungsweg',
  beschreibung: 'Beschreibung',
  vs_kuerzungs_typ: 'Kürzungs-Typ',
  vs_quote_prozent: 'Quote (%)',
  vs_quote_grund: 'Quote-Grund',
  filmcheck_am: 'Filmcheck am',
  eskalation_stufe: 'Eskalations-Stufe',
  ergebnis: 'Ergebnis',
  naechste_aktion: 'Nächste Aktion',
  auszahlung_kunde_betrag: 'Kunden-Betrag (EUR)',
  auszahlung_kunde_eingegangen_am: 'Kunden-Eingang am',
  auszahlung_gutachter_eingegangen_am: 'Gutachter-Eingang am',
  upload_url: 'Upload-URL',
  notiz_sv: 'Notiz SV',
}

type ProcessedEventMap = Record<string, boolean>

export interface LexDriveTriggerPanelProps {
  fallId: string
  processedEvents?: ProcessedEventMap
}

export default function EndpointRegister({ fallId, processedEvents }: LexDriveTriggerPanelProps) {
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
        if (k === 'betrag' || k === 'kuerzungs_betrag' || k === 'anerkannt_betrag' ||
            k === 'vs_quote_prozent' || k === 'auszahlung_kunde_betrag') {
          converted[k] = Number(v)
        } else {
          converted[k] = v
        }
      }
      // AAR-540: vs_kuerzt Pflicht-Validation client-seitig
      if (activeEvent.id === 'vs_kuerzt' && !converted.vs_kuerzungs_typ) {
        setFeedback({ ok: false, msg: 'Kürzungs-Typ ist Pflichtfeld' })
        return
      }
      const result = await triggerLexDriveEventManually(fallId, activeEvent.id, converted)
      if (result.success) {
        setFeedback({ ok: true, msg: `Event "${activeEvent.label}" ausgelöst.` })
        setActiveEvent(null)
        setPayload({})
      } else {
        setFeedback({ ok: false, msg: result.error ?? 'Fehler' })
      }
      setTimeout(() => setFeedback(null), 5000)
    })
  }

  const statusFor = (id: LexDriveEvent) => processedEvents?.[id] === true

  return (
    <div className="bg-white rounded-2xl border border-claimondo-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#0D1B3E]">Endpoint-Register</h3>
        <StatusBadge colorCls="text-amber-700 bg-amber-50 uppercase">
          Manueller Modus
        </StatusBadge>
      </div>

      <p className="text-xs text-claimondo-ondo leading-relaxed">
        Bis die LexDrive-Webhook-Integration live ist: alle Events hier manuell auslösen. Trigger-Logik
        (Status, Felder, WhatsApp, Mitteilungen, Timeline) ist identisch zum Webhook. ✓ = Event wurde
        bereits verarbeitet, ⏳ = offen.
      </p>

      {EVENT_GROUPS.map(group => (
        <div key={group.label}>
          <p className="text-[10px] uppercase text-claimondo-ondo/70 font-semibold tracking-wider mb-2">{group.label}</p>
          <div className="grid grid-cols-2 gap-2">
            {group.events.map(ev => {
              const Icon = ev.icon
              const done = statusFor(ev.id)
              return (
                <button
                  key={ev.id}
                  onClick={() => { setActiveEvent(ev); setPayload({}) }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                    done
                      ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      : 'text-claimondo-navy bg-[#f8f9fb] hover:bg-[#4573A2] hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1">{ev.label}</span>
                  <span className="text-[10px] shrink-0">{done ? '✓' : '⏳'}</span>
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

      <Modal open={activeEvent !== null} onClose={() => setActiveEvent(null)} maxWidth={448} ariaLabel="LexDrive-Event auslösen">
        {activeEvent && (
          <div className="space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#0D1B3E]">Auslösen: {activeEvent.label}</h3>
              <button onClick={() => setActiveEvent(null)} className="text-claimondo-ondo/70 hover:text-claimondo-ondo">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {activeEvent.fields.length === 0 && (
              <p className="text-sm text-claimondo-ondo">
                <CircleIcon className="w-3 h-3 inline-block mr-1" />
                Keine zusätzlichen Angaben nötig.
              </p>
            )}

            {activeEvent.fields.map(field => (
              <div key={field}>
                <label className="text-xs font-medium text-claimondo-navy mb-1 block">
                  {FIELD_LABELS[field]}
                  {field === 'vs_kuerzungs_typ' && <span className="text-red-500 ml-1">*</span>}
                </label>
                {field === 'vs_kuerzungs_typ' ? (
                  <div className="flex gap-2">
                    {(['technisch', 'argumentativ', 'gemischt'] as const).map(opt => (
                      <label key={opt} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="vs_kuerzungs_typ"
                          value={opt}
                          checked={payload[field] === opt}
                          onChange={e => setPayload({ ...payload, [field]: e.target.value })}
                          className="accent-[#4573A2]"
                        />
                        <span className="capitalize">{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : field === 'eskalation_stufe' ? (
                  <select
                    value={payload[field] ?? ''}
                    onChange={e => setPayload({ ...payload, [field]: e.target.value })}
                    className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm focus:outline-none focus:border-[#4573A2]"
                  >
                    <option value="">Bitte wählen</option>
                    <option value="tag14">Tag 14</option>
                    <option value="tag21">Tag 21</option>
                    <option value="tag28">Tag 28</option>
                  </select>
                ) : field === 'naechste_aktion' ? (
                  <select
                    value={payload[field] ?? ''}
                    onChange={e => setPayload({ ...payload, [field]: e.target.value })}
                    className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm focus:outline-none focus:border-[#4573A2]"
                  >
                    <option value="">Bitte wählen</option>
                    <option value="warten">Warten</option>
                    <option value="erneut_kontaktieren">Erneut kontaktieren</option>
                    <option value="eskalieren">Eskalieren</option>
                  </select>
                ) : field === 'zahlungsweg' ? (
                  <select
                    value={payload[field] ?? ''}
                    onChange={e => setPayload({ ...payload, [field]: e.target.value })}
                    className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm focus:outline-none focus:border-[#4573A2]"
                  >
                    <option value="">Bitte wählen</option>
                    <option value="banktransfer_direkt">Banktransfer direkt</option>
                    <option value="fremdkonto_kanzlei">Fremdkonto Kanzlei</option>
                    <option value="sammelueberweisung">Sammelüberweisung</option>
                  </select>
                ) : field === 'grund' || field === 'beschreibung' || field === 'ergebnis' ||
                   field === 'vs_quote_grund' || field === 'notiz_sv' ? (
                  <textarea
                    value={payload[field] ?? ''}
                    onChange={e => setPayload({ ...payload, [field]: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm focus:outline-none focus:border-[#4573A2]"
                  />
                ) : (
                  <input
                    type={
                      field === 'datum' || field === 'frist_bis' || field === 'filmcheck_am' ||
                      field === 'auszahlung_kunde_eingegangen_am' || field === 'auszahlung_gutachter_eingegangen_am'
                        ? 'date'
                        : field.includes('betrag') || field === 'vs_quote_prozent'
                        ? 'number'
                        : 'text'
                    }
                    value={payload[field] ?? ''}
                    onChange={e => setPayload({ ...payload, [field]: e.target.value })}
                    className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm focus:outline-none focus:border-[#4573A2]"
                  />
                )}
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setActiveEvent(null)} className="flex-1 py-2.5 text-sm text-claimondo-ondo hover:bg-[#f8f9fb] rounded-lg">
                Abbrechen
              </button>
              <button onClick={handleSubmit} disabled={pending}
                className="flex-1 py-2.5 text-sm bg-claimondo-ondo text-white rounded-lg disabled:opacity-50 hover:bg-claimondo-navy">
                {pending ? 'Lädt…' : 'Auslösen'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
