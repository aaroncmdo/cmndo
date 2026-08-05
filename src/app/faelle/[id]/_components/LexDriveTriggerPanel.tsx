'use client'

// AAR-108 / AAR-540 (C3): Endpoint-Register — manuelle Trigger für alle
// 24+ LexDrive/Manual-Events aus der Fallakte. ✓/⏳-Status-Badges lesen
// aus webhook_events; special-Events (manual_status_override) nicht sichtbar.
import { useState, useTransition, useEffect } from 'react'
import {
  CheckCircleIcon, FileTextIcon, AlertTriangleIcon, EuroIcon,
  ClockIcon, GavelIcon, XCircleIcon, ScaleIcon, EyeIcon, CircleIcon, XIcon,
  HandshakeIcon, FilmIcon, UsersIcon, PhoneIcon, UploadIcon, ShieldAlertIcon,
  type LucideIcon,
} from 'lucide-react'
import { triggerLexDriveEventManually, getProcessedLexDriveEvents } from '../lexdrive-actions'
import type { LexDriveEvent } from '@/lib/lexdrive/process-event'
import { Modal } from '@/components/primitives/Modal'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { KUERZBARE_POSITIONEN, FORDERUNGSPOSITION_TYP_LABEL } from '@/lib/kanzlei-fall/forderungsposition-typ'

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
  // Fortschritts-Status: initial aus dem (optionalen) Prop, dann live nachgeladen.
  const [processed, setProcessed] = useState<ProcessedEventMap>(processedEvents ?? {})
  // GEO-P2 SP1: per-Position-Kürzungen (nur vs_kuerzt), typ -> {gefordert, gekuerzt}
  const [positionen, setPositionen] = useState<Record<string, { gefordert: string; gekuerzt: string }>>({})

  useEffect(() => {
    let alive = true
    getProcessedLexDriveEvents(fallId)
      .then((m) => { if (alive) setProcessed(m) })
      .catch(() => { /* Badges bleiben dann auf dem Prop-Stand */ })
    return () => { alive = false }
  }, [fallId])

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
      // GEO-P2 SP1: per-Position-Kürzungen aus dem Subform in den Payload (nur mit gekürzt-Betrag)
      if (activeEvent.id === 'vs_kuerzt') {
        const pos = Object.entries(positionen)
          .map(([typ, v]) => ({
            typ,
            betrag_gefordert: v.gefordert ? Number(v.gefordert) : null,
            betrag_gekuerzt: Number(v.gekuerzt),
          }))
          .filter((p) => Number.isFinite(p.betrag_gekuerzt) && p.betrag_gekuerzt > 0)
        if (pos.length > 0) converted.positionen = pos
      }
      const result = await triggerLexDriveEventManually(fallId, activeEvent.id, converted)
      if (result.success) {
        // Optimistisch: das gerade ausgelöste Event sofort als ✓ markieren.
        setProcessed((p) => ({ ...p, [activeEvent.id]: true }))
        setFeedback({ ok: true, msg: `Event "${activeEvent.label}" ausgelöst.` })
        setActiveEvent(null)
        setPayload({})
        setPositionen({})
      } else {
        setFeedback({ ok: false, msg: result.error ?? 'Fehler' })
      }
      setTimeout(() => setFeedback(null), 5000)
    })
  }

  const statusFor = (id: LexDriveEvent) => processed[id] === true

  return (
    <div className="bg-white rounded-2xl border border-claimondo-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-claimondo-navy">Endpoint-Register</h3>
        <StatusBadge colorCls="text-warning-strong bg-warning-soft uppercase">
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
                  onClick={() => { setActiveEvent(ev); setPayload({}); setPositionen({}) }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-ios-lg transition-colors text-left ${
                    done
                      ? 'text-success-strong bg-success-soft hover:bg-success/15'
                      : 'text-claimondo-navy bg-claimondo-bg hover:bg-claimondo-ondo hover:text-white'
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
        <p className={`text-xs px-3 py-2 rounded ${feedback.ok ? 'bg-success-soft text-success-strong' : 'bg-danger-soft text-danger-strong'}`}>
          {feedback.msg}
        </p>
      )}

      <Modal open={activeEvent !== null} onClose={() => setActiveEvent(null)} maxWidth={448} ariaLabel="LexDrive-Event auslösen">
        {activeEvent && (
          <div className="space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-claimondo-navy">Auslösen: {activeEvent.label}</h3>
              <button onClick={() => setActiveEvent(null)} className="text-claimondo-ondo/70 hover:text-claimondo-ondo">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {statusFor(activeEvent.id) && (
              <div className="flex items-start gap-2 rounded-ios-lg bg-warning-soft border border-warning/30 px-3 py-2.5">
                <AlertTriangleIcon className="w-4 h-4 shrink-0 text-warning-strong mt-0.5" />
                <p className="text-xs text-warning-strong leading-relaxed">
                  Dieses Event wurde für diesen Fall <strong>bereits verarbeitet</strong>. Erneutes Auslösen
                  wiederholt alle Nebenwirkungen (Status, Benachrichtigungen, Mitteilungen, Timeline) —
                  nur bei bewusster Korrektur nötig.
                </p>
              </div>
            )}

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
                  {field === 'vs_kuerzungs_typ' && <span className="text-danger ml-1">*</span>}
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
                          className="accent-claimondo-ondo"
                        />
                        <span className="capitalize">{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : field === 'eskalation_stufe' ? (
                  <select
                    value={payload[field] ?? ''}
                    onChange={e => setPayload({ ...payload, [field]: e.target.value })}
                    className="w-full px-3 py-2 border border-claimondo-border rounded-ios-lg text-sm focus:outline-none focus:border-claimondo-ondo"
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
                    className="w-full px-3 py-2 border border-claimondo-border rounded-ios-lg text-sm focus:outline-none focus:border-claimondo-ondo"
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
                    className="w-full px-3 py-2 border border-claimondo-border rounded-ios-lg text-sm focus:outline-none focus:border-claimondo-ondo"
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
                    className="w-full px-3 py-2 border border-claimondo-border rounded-ios-lg text-sm focus:outline-none focus:border-claimondo-ondo"
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
                    className="w-full px-3 py-2 border border-claimondo-border rounded-ios-lg text-sm focus:outline-none focus:border-claimondo-ondo"
                  />
                )}
              </div>
            ))}

            {activeEvent.id === 'vs_kuerzt' && (
              <div className="space-y-2 border-t border-claimondo-border pt-3">
                <p className="text-xs font-semibold text-claimondo-navy">
                  Kürzungspositionen <span className="font-normal text-claimondo-ondo">(optional — je Position gefordert/gekürzt in EUR)</span>
                </p>
                {KUERZBARE_POSITIONEN.map((typ) => (
                  <div key={typ} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2">
                    <span className="text-xs text-claimondo-navy truncate" title={FORDERUNGSPOSITION_TYP_LABEL[typ]}>
                      {FORDERUNGSPOSITION_TYP_LABEL[typ]}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="gefordert"
                      value={positionen[typ]?.gefordert ?? ''}
                      onChange={(e) => setPositionen((p) => ({ ...p, [typ]: { gefordert: e.target.value, gekuerzt: p[typ]?.gekuerzt ?? '' } }))}
                      className="w-full px-2 py-1.5 border border-claimondo-border rounded-ios-lg text-xs focus:outline-none focus:border-claimondo-ondo"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="gekürzt"
                      value={positionen[typ]?.gekuerzt ?? ''}
                      onChange={(e) => setPositionen((p) => ({ ...p, [typ]: { gefordert: p[typ]?.gefordert ?? '', gekuerzt: e.target.value } }))}
                      className="w-full px-2 py-1.5 border border-claimondo-border rounded-ios-lg text-xs focus:outline-none focus:border-claimondo-ondo"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setActiveEvent(null)} className="flex-1 py-2.5 text-sm text-claimondo-ondo hover:bg-claimondo-bg rounded-ios-lg">
                Abbrechen
              </button>
              <button onClick={handleSubmit} disabled={pending}
                className={`flex-1 py-2.5 text-sm text-white rounded-ios-lg disabled:opacity-50 ${
                  statusFor(activeEvent.id)
                    ? 'bg-warning hover:bg-warning/90'
                    : 'bg-claimondo-ondo hover:bg-claimondo-navy'
                }`}>
                {pending ? 'Lädt…' : statusFor(activeEvent.id) ? 'Trotzdem erneut auslösen' : 'Auslösen'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
