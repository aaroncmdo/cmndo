'use client'

// AAR-115: SV-Zuweisung + Termin-Reservierung im Lead-Detail (Dispatch-Portal)
// Dispatcher waehlt vor FlowLink-Versand einen SV aus den Isochrone-Vorschlaegen
// (findBestSV) und reserviert einen Termin. Der Termin wird mit lead_id
// (NICHT fall_id) angelegt und nach SA-Unterschrift im FlowWizard zu einem
// Fall-Termin upgegradet.

import { useState, useTransition, useEffect } from 'react'
import {
  CalendarCheckIcon,
  MapPinIcon,
  UserCheckIcon,
  XIcon,
  RefreshCwIcon,
  ClockIcon,
  AlertTriangleIcon,
  XCircleIcon,
  CheckIcon,
} from 'lucide-react'
import {
  listSvSuggestionsForLead,
  reserveSvTerminForLead,
  cancelSvTerminForLead,
  acceptGegenvorschlag,
  getNextFreeSlotsForSv,
  type SvSuggestion,
} from './actions'

type AktiverTermin = {
  id: string
  sv_id: string
  sv_vorname: string | null
  sv_nachname: string | null
  start_zeit: string
  end_zeit: string
  status: string
  // AAR-134
  sv_ablehnung_grund?: string | null
  sv_vorgeschlagene_slots?: { start: string; end: string }[] | null
}

export default function SvDispatchPanel({
  leadId,
  hardGateOk,
  aktiverTermin,
}: {
  leadId: string
  hardGateOk: boolean
  aktiverTermin: AktiverTermin | null
}) {
  const [pending, startTransition] = useTransition()
  const [suggestions, setSuggestions] = useState<SvSuggestion[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedSv, setSelectedSv] = useState<SvSuggestion | null>(null)
  const [startDatum, setStartDatum] = useState('')
  const [startZeit, setStartZeit] = useState('09:00')
  const [dauerMin, setDauerMin] = useState(120)
  const [toast, setToast] = useState('')
  // AAR-195: Vorgeschlagene Slots für den ausgewählten SV
  const [freeSlots, setFreeSlots] = useState<{ start: string; end: string }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  // Slots nachladen sobald SV ausgewählt ist (oder Dauer wechselt)
  useEffect(() => {
    if (!selectedSv) {
      setFreeSlots([])
      return
    }
    let cancelled = false
    setSlotsLoading(true)
    getNextFreeSlotsForSv(selectedSv.svId, 3, dauerMin)
      .then((r) => {
        if (!cancelled) setFreeSlots(r.success ? r.slots ?? [] : [])
      })
      .catch(() => {
        if (!cancelled) setFreeSlots([])
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedSv, dauerMin])

  function handleReserveSlot(slotStartIso: string) {
    if (!selectedSv) return
    startTransition(async () => {
      const r = await reserveSvTerminForLead(leadId, selectedSv.svId, slotStartIso, dauerMin)
      if (r.success) {
        setToast('Termin reserviert')
        setSelectedSv(null)
        setSuggestions(null)
      } else {
        setToast(r.error ?? 'Fehler beim Reservieren')
      }
      setTimeout(() => setToast(''), 3000)
    })
  }

  // Defaults: morgen 09:00 als erster Slot
  useEffect(() => {
    if (!startDatum) {
      const morgen = new Date()
      morgen.setDate(morgen.getDate() + 1)
      setStartDatum(morgen.toISOString().slice(0, 10))
    }
  }, [startDatum])

  function loadSuggestions() {
    setLoadError(null)
    startTransition(async () => {
      const r = await listSvSuggestionsForLead(leadId)
      if (!r.success) {
        setLoadError(r.error ?? 'Unbekannter Fehler')
        setSuggestions([])
        return
      }
      setSuggestions(r.suggestions ?? [])
    })
  }

  function handleReserve() {
    if (!selectedSv || !startDatum || !startZeit) return
    const startIso = new Date(`${startDatum}T${startZeit}:00`)
    if (startIso.getTime() < Date.now()) {
      setToast('Startzeit liegt in der Vergangenheit')
      setTimeout(() => setToast(''), 3000)
      return
    }
    startTransition(async () => {
      const r = await reserveSvTerminForLead(leadId, selectedSv.svId, startIso.toISOString(), dauerMin)
      if (r.success) {
        setToast('Termin reserviert')
        setSelectedSv(null)
        setSuggestions(null)
      } else {
        setToast(r.error ?? 'Fehler beim Reservieren')
      }
      setTimeout(() => setToast(''), 3000)
    })
  }

  function handleCancel() {
    if (!confirm('Termin wirklich stornieren? Der Lead verliert den SV-Slot.')) return
    startTransition(async () => {
      const r = await cancelSvTerminForLead(leadId)
      setToast(r.success ? 'Termin storniert' : r.error ?? 'Fehler')
      setTimeout(() => setToast(''), 2500)
    })
  }

  // ─── AAR-134: Slot-Akzeptieren-Handler ────────────────────────────────────
  function handleAcceptSlot(slotIndex: number) {
    if (!aktiverTermin) return
    startTransition(async () => {
      const r = await acceptGegenvorschlag(aktiverTermin.id, slotIndex)
      setToast(r.success ? 'Slot akzeptiert' : r.error ?? 'Fehler')
      setTimeout(() => setToast(''), 3000)
    })
  }

  // ─── AAR-134: Status 'abgelehnt' ──────────────────────────────────────────
  if (aktiverTermin && aktiverTermin.status === 'abgelehnt') {
    const svName = [aktiverTermin.sv_vorname, aktiverTermin.sv_nachname].filter(Boolean).join(' ') || 'SV'
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <XCircleIcon className="w-5 h-5 text-red-600 shrink-0" />
          <h2 className="text-sm font-semibold text-red-900">SV hat Termin abgelehnt</h2>
        </div>
        <div className="text-xs text-red-800 space-y-1">
          <p><span className="font-medium">Sachverständiger:</span> {svName}</p>
          {aktiverTermin.sv_ablehnung_grund && (
            <p><span className="font-medium">Grund:</span> {aktiverTermin.sv_ablehnung_grund}</p>
          )}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={handleCancel}
          className="w-full text-xs font-medium px-3 py-2 rounded-lg bg-[#4573A2] hover:bg-[#3a6290] text-white disabled:opacity-50"
        >
          Termin schließen + neuen SV wählen
        </button>
        {toast && <p className="text-xs text-center">{toast}</p>}
      </div>
    )
  }

  // ─── AAR-134: Status 'gegenvorschlag' ─────────────────────────────────────
  if (aktiverTermin && aktiverTermin.status === 'gegenvorschlag') {
    const svName = [aktiverTermin.sv_vorname, aktiverTermin.sv_nachname].filter(Boolean).join(' ') || 'SV'
    const slots = aktiverTermin.sv_vorgeschlagene_slots ?? []
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ClockIcon className="w-5 h-5 text-amber-600 shrink-0" />
          <h2 className="text-sm font-semibold text-amber-900">{svName} schlägt andere Termine vor</h2>
        </div>
        {aktiverTermin.sv_ablehnung_grund && (
          <p className="text-xs text-amber-800">
            <span className="font-medium">Begründung:</span> {aktiverTermin.sv_ablehnung_grund}
          </p>
        )}
        <div className="space-y-1.5">
          {slots.map((slot, i) => {
            const s = new Date(slot.start)
            const e = new Date(slot.end)
            return (
              <button
                key={i}
                type="button"
                disabled={pending}
                onClick={() => handleAcceptSlot(i)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white hover:bg-emerald-50 border border-amber-200 hover:border-emerald-300 text-xs disabled:opacity-50"
              >
                <span className="text-gray-800">
                  Slot {i + 1}: {s.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} ·{' '}
                  {s.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} – {e.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckIcon className="w-3.5 h-3.5" /> Akzeptieren
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={handleCancel}
          className="w-full text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Stornieren + neuen SV wählen
        </button>
        {toast && <p className="text-xs text-center">{toast}</p>}
      </div>
    )
  }

  // ─── Wenn bereits ein Termin existiert (reserviert/bestaetigt), zeige ihn an
  if (aktiverTermin) {
    const start = new Date(aktiverTermin.start_zeit)
    const ende = new Date(aktiverTermin.end_zeit)
    const svName = [aktiverTermin.sv_vorname, aktiverTermin.sv_nachname].filter(Boolean).join(' ') || 'SV'
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
            <CalendarCheckIcon className="w-4 h-4" /> SV-Termin reserviert
          </h2>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            aktiverTermin.status === 'bestaetigt'
              ? 'bg-emerald-200 text-emerald-800'
              : 'bg-amber-100 text-amber-700'
          }`}>
            {aktiverTermin.status === 'bestaetigt' ? 'Bestätigt' : 'Reserviert'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] text-emerald-700 uppercase">Sachverständiger</p>
            <p className="font-medium text-emerald-900">{svName}</p>
          </div>
          <div>
            <p className="text-[10px] text-emerald-700 uppercase">Termin</p>
            <p className="font-medium text-emerald-900">
              {start.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
              {' · '}
              {start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              {' – '}
              {ende.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <button
          disabled={pending}
          onClick={handleCancel}
          className="w-full text-xs font-medium text-red-700 hover:text-red-800 hover:bg-red-50 py-2 rounded-lg border border-red-200 flex items-center justify-center gap-2"
        >
          <XIcon className="w-3.5 h-3.5" /> Reservierung stornieren
        </button>
        {toast && <p className="text-xs text-emerald-800 text-center">{toast}</p>}
      </div>
    )
  }

  // ─── Noch kein Termin: SV-Auswahl + Zeitslot ─────────────────────────────
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <UserCheckIcon className="w-4 h-4 text-[#4573A2]" /> SV-Termin reservieren
        </h2>
        {!hardGateOk && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            Hard Gate erst abschließen
          </span>
        )}
      </div>

      {!hardGateOk ? (
        <p className="text-xs text-gray-500 flex items-start gap-2">
          <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Schritt 0 (Hard Gate) muss vollständig beantwortet sein bevor ein SV reserviert werden kann.
        </p>
      ) : (
        <>
          {/* Schritt 1: SV-Vorschlaege laden */}
          {!suggestions && (
            <button
              type="button"
              disabled={pending}
              onClick={loadSuggestions}
              className="w-full text-sm font-medium px-3 py-2.5 rounded-lg bg-[#4573A2] text-white hover:bg-[#3a6290] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <MapPinIcon className="w-4 h-4" />
              {pending ? 'Suche läuft...' : 'SV-Vorschläge laden (Isochrone)'}
            </button>
          )}

          {loadError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
              <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {loadError}
            </p>
          )}

          {suggestions && suggestions.length === 0 && !loadError && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Keine SVs in Reichweite gefunden. Prüfe Kontingent, Urlaub oder Isochrone-Polygone.
            </p>
          )}

          {/* Schritt 2: SV-Liste */}
          {suggestions && suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-gray-500 uppercase font-medium">
                  {suggestions.length} Kandidaten (sortiert nach Score)
                </p>
                <button
                  type="button"
                  onClick={loadSuggestions}
                  disabled={pending}
                  className="text-[10px] text-[#4573A2] hover:text-[#3a6290] flex items-center gap-1"
                >
                  <RefreshCwIcon className="w-3 h-3" /> neu laden
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {suggestions.map((s) => {
                  const isSel = selectedSv?.svId === s.svId
                  return (
                    <button
                      key={s.svId}
                      type="button"
                      onClick={() => setSelectedSv(s)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                        isSel
                          ? 'bg-[#0D1B3E] text-white border-[#0D1B3E]'
                          : 'bg-white border-gray-200 hover:border-[#4573A2] hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{s.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          isSel ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>{s.paket}</span>
                      </div>
                      <div className={`flex items-center gap-3 mt-1 text-[11px] ${isSel ? 'text-white/80' : 'text-gray-500'}`}>
                        <span>{s.distanzKm.toFixed(1)} km</span>
                        <span>Score {s.score.toFixed(1)}</span>
                        <span>{s.kontingentFrei} frei</span>
                        <span>{s.offeneFaelle} offen</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Schritt 3: Zeitslot */}
          {selectedSv && (
            <div className="space-y-3 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-gray-400" />
                  <p className="text-xs font-medium text-gray-700">
                    Terminzeit bei <span className="text-[#0D1B3E]">{selectedSv.name}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSv(null)}
                  className="text-[10px] text-[#4573A2] hover:underline"
                >
                  Anderen SV wählen
                </button>
              </div>

              {/* AAR-195: Slot-Vorschläge — Klick = sofort reservieren.
                  Manuelle Eingabe bleibt parallel sichtbar für Sonderfälle. */}
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Vorgeschlagene Slots {slotsLoading && '(lade …)'}
                </p>
                {!slotsLoading && freeSlots.length === 0 && (
                  <p className="text-[11px] text-gray-400 italic">
                    Keine automatischen Slots — bitte manuell eingeben.
                  </p>
                )}
                {freeSlots.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {freeSlots.map((slot) => {
                      const start = new Date(slot.start)
                      const end = new Date(slot.end)
                      const tag = start.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
                      const von = start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                      const bis = end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                      return (
                        <button
                          key={slot.start}
                          type="button"
                          disabled={pending}
                          onClick={() => handleReserveSlot(slot.start)}
                          className="px-2 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 flex flex-col items-start"
                        >
                          <span className="flex items-center gap-1">
                            <CalendarCheckIcon className="w-3 h-3" />
                            {tag}
                          </span>
                          <span className="text-gray-700">{von} – {bis}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <p className="text-[10px] text-gray-400 uppercase tracking-wider pt-2 border-t border-gray-100">
                Oder manuell eingeben
              </p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="date"
                  value={startDatum}
                  onChange={(e) => setStartDatum(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <input
                  type="time"
                  value={startZeit}
                  onChange={(e) => setStartZeit(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  step={900}
                />
                <div className="relative">
                  <select
                    value={dauerMin}
                    onChange={(e) => setDauerMin(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white"
                  >
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>120 min</option>
                    <option value={150}>150 min</option>
                    <option value={180}>180 min</option>
                    <option value={240}>240 min</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                disabled={pending || !startDatum || !startZeit}
                onClick={handleReserve}
                className="w-full text-sm font-medium px-3 py-2.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <CalendarCheckIcon className="w-4 h-4" />
                {pending ? 'Reserviere...' : `Termin reservieren (${dauerMin} min)`}
              </button>
            </div>
          )}

          {toast && (
            <div className={`text-xs px-3 py-2 rounded-lg ${
              toast === 'Termin reserviert' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
            }`}>
              {toast}
            </div>
          )}
        </>
      )}
    </div>
  )
}
