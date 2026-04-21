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
  SearchIcon,
} from 'lucide-react'
import {
  listSvSuggestionsForLead,
  reserveSvTerminForLead,
  cancelSvTerminForLead,
  acceptGegenvorschlag,
  getNextFreeSlotsForSv,
  getSvSuggestionsWithSlots,
  debugSvMatching,
  type SvSuggestion,
  type SlotCandidate,
  type SlotMatchType,
} from './actions'
import type { DebugSvMatchingResponse } from '@/lib/dispatch/debugSvMatching'

type SvWithSlots = SvSuggestion & { slots: SlotCandidate[] }

const MATCH_BADGE: Record<SlotMatchType, { label: string; cls: string } | null> = {
  wunschtermin: { label: '✨ Wunschtermin', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  gleicher_tag: { label: '📅 Gleicher Tag', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  nahe: { label: 'Nahe', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  nach: null,
}

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
  hardGateDetails,
  aktiverTermin,
  wunschterminIso,
  wunschterminWochentage,
}: {
  leadId: string
  hardGateOk: boolean
  // AAR-615: Einzelne q1/q2/q3-Flags für präzise Fehlermeldung
  hardGateDetails?: { q1: boolean; q2: boolean; q3: boolean } | null
  aktiverTermin: AktiverTermin | null
  // AAR-264: Wunschtermin des Kunden — wenn gesetzt, wird der Slot-Picker
  // damit vorbelegt und Verfügbarkeits-Badges werden angezeigt.
  wunschterminIso?: string | null
  // AAR-270: Wochentag-Präferenz (ISO 1=Mo..7=So). Filtert Slot-Vorschläge.
  wunschterminWochentage?: number[] | null
}) {
  const [pending, startTransition] = useTransition()
  // AAR-522: Top-3 SVs + ihre Slots werden beim Mount automatisch geladen.
  // `extraSuggestions` (SV 4-8, ohne Slots) erst auf Klick „Weitere SVs".
  const [topSuggestions, setTopSuggestions] = useState<SvWithSlots[] | null>(null)
  const [topLoading, setTopLoading] = useState(false)
  const [extraSuggestions, setExtraSuggestions] = useState<SvSuggestion[] | null>(null)
  const [extraLoading, setExtraLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedSv, setSelectedSv] = useState<SvSuggestion | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [startDatum, setStartDatum] = useState('')
  const [startZeit, setStartZeit] = useState('09:00')
  const [dauerMin, setDauerMin] = useState(120)
  const [toast, setToast] = useState('')
  // AAR-195: Vorgeschlagene Slots für den manuell aus Extra-Liste gewählten SV
  const [freeSlots, setFreeSlots] = useState<SlotCandidate[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  // AAR-521: Debug-Modal für "Warum keine SVs?"
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugData, setDebugData] = useState<DebugSvMatchingResponse | null>(null)
  const [debugLoading, setDebugLoading] = useState(false)
  const [debugError, setDebugError] = useState<string | null>(null)

  function openDebugModal() {
    setDebugOpen(true)
    setDebugLoading(true)
    setDebugError(null)
    setDebugData(null)
    debugSvMatching(leadId)
      .then((r) => {
        if (r.success && r.data) setDebugData(r.data)
        else setDebugError(r.error ?? 'Debug fehlgeschlagen')
      })
      .catch((e) => setDebugError(e instanceof Error ? e.message : 'Debug fehlgeschlagen'))
      .finally(() => setDebugLoading(false))
  }

  // AAR-522: Slots für einen manuell aus der Extra-Liste ausgewählten SV.
  // Die Top-3-SV-Cards haben ihre Slots bereits inline — hier wird nur
  // nachgeladen wenn der Dispatcher aus „Weitere SVs" einen pickt.
  useEffect(() => {
    if (!selectedSv) {
      setFreeSlots([])
      return
    }
    // Wenn selectedSv bereits Top-3 ist, seine Slots sind schon im Cache.
    const top = topSuggestions?.find((s) => s.svId === selectedSv.svId)
    if (top) {
      setFreeSlots(top.slots)
      return
    }
    let cancelled = false
    setSlotsLoading(true)
    getNextFreeSlotsForSv(selectedSv.svId, 3, dauerMin, {
      wunschterminIso: wunschterminIso ?? null,
      wunschterminWochentage: wunschterminWochentage ?? null,
    })
      .then((r) => {
        if (!cancelled) setFreeSlots(r.success ? r.slots ?? [] : [])
      })
      .catch(() => {
        if (!cancelled) setFreeSlots([])
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedSv, dauerMin, wunschterminIso, wunschterminWochentage, topSuggestions])

  // AAR-522: Auto-Load Top-3 SVs + Slots beim Mount, sobald Hard Gate offen ist.
  useEffect(() => {
    if (!hardGateOk) return
    if (topSuggestions !== null || topLoading) return
    setTopLoading(true)
    setLoadError(null)
    getSvSuggestionsWithSlots(leadId, { slotsPerSv: 3, maxSvs: 3, slotDauerMin: dauerMin })
      .then((r) => {
        if (r.success) setTopSuggestions(r.suggestions ?? [])
        else {
          setLoadError(r.error ?? 'SV-Suche fehlgeschlagen')
          setTopSuggestions([])
        }
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : 'SV-Suche fehlgeschlagen')
        setTopSuggestions([])
      })
      .finally(() => setTopLoading(false))
  }, [hardGateOk, leadId, dauerMin, topSuggestions, topLoading])

  function reloadTop() {
    setTopSuggestions(null)
    setExtraSuggestions(null)
    setSelectedSv(null)
  }

  function loadExtraSvs() {
    if (extraLoading || extraSuggestions !== null) return
    setExtraLoading(true)
    listSvSuggestionsForLead(leadId)
      .then((r) => {
        if (r.success && r.suggestions) {
          const topIds = new Set((topSuggestions ?? []).map((t) => t.svId))
          setExtraSuggestions(r.suggestions.filter((s) => !topIds.has(s.svId)))
        } else {
          setExtraSuggestions([])
        }
      })
      .catch(() => setExtraSuggestions([]))
      .finally(() => setExtraLoading(false))
  }

  function handleReserveSlot(svId: string, slotStartIso: string) {
    startTransition(async () => {
      const r = await reserveSvTerminForLead(leadId, svId, slotStartIso, dauerMin)
      if (r.success) {
        setToast('Termin reserviert')
        setSelectedSv(null)
        setTopSuggestions(null)
        setExtraSuggestions(null)
        setShowManual(false)
      } else {
        setToast(r.error ?? 'Fehler beim Reservieren')
      }
      setTimeout(() => setToast(''), 3000)
    })
  }

  // Defaults: Wunschtermin (AAR-264) > Wunschtag (AAR-270) > morgen 09:00
  useEffect(() => {
    if (startDatum) return
    if (wunschterminIso) {
      const wt = new Date(wunschterminIso)
      if (!Number.isNaN(wt.getTime())) {
        setStartDatum(wt.toISOString().slice(0, 10))
        setStartZeit(wt.toTimeString().slice(0, 5))
        return
      }
    }
    // AAR-270: Wenn Wunschtag(e) gesetzt → springe auf nächsten passenden
    // Tag vor (max 14 Tage Lookahead). Sonst morgen.
    const kandidat = new Date()
    kandidat.setDate(kandidat.getDate() + 1)
    if (wunschterminWochentage && wunschterminWochentage.length > 0) {
      for (let i = 0; i < 14; i++) {
        const day = kandidat.getDay()
        const iso = day === 0 ? 7 : day
        if (wunschterminWochentage.includes(iso)) break
        kandidat.setDate(kandidat.getDate() + 1)
      }
    }
    setStartDatum(kandidat.toISOString().slice(0, 10))
  }, [startDatum, wunschterminIso, wunschterminWochentage])

  function handleReserve() {
    if (!selectedSv || !startDatum || !startZeit) return
    const startIso = new Date(`${startDatum}T${startZeit}:00`)
    if (startIso.getTime() < Date.now()) {
      setToast('Startzeit liegt in der Vergangenheit')
      setTimeout(() => setToast(''), 3000)
      return
    }
    handleReserveSlot(selectedSv.svId, startIso.toISOString())
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
        <div className="space-y-2">
          <p className="text-xs text-gray-500 flex items-start gap-2">
            <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Folgende Punkte in Schritt 0 (Hard Gate) müssen noch beantwortet werden:
          </p>
          {hardGateDetails && (
            <ul className="space-y-1 pl-1">
              {!hardGateDetails.q1 && (
                <li className="text-xs text-amber-800 flex items-center gap-2">
                  <span className="w-4 h-4 flex items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold shrink-0">1</span>
                  Unfallhergang + Schuldfrage fehlt (oder Teilschuld noch nicht bestätigt)
                </li>
              )}
              {!hardGateDetails.q2 && (
                <li className="text-xs text-amber-800 flex items-center gap-2">
                  <span className="w-4 h-4 flex items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold shrink-0">2</span>
                  Schaden nicht bestätigt (Schaden sichtbar, Personenschaden, Mietwagen oder Nutzungsausfall)
                </li>
              )}
              {!hardGateDetails.q3 && (
                <li className="text-xs text-amber-800 flex items-center gap-2">
                  <span className="w-4 h-4 flex items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold shrink-0">3</span>
                  Polizei vor Ort — noch nicht beantwortet (Ja oder Nein)
                </li>
              )}
            </ul>
          )}
        </div>
      ) : (
        <>
          {/* AAR-522: Auto-Load-Status */}
          {topLoading && (
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-[#4573A2] animate-pulse" />
              Lade nächste verfügbare SVs …
            </p>
          )}

          {loadError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
              <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {loadError}
            </p>
          )}

          {topSuggestions && topSuggestions.length === 0 && !loadError && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 space-y-1.5">
              <p>Keine SVs in Reichweite gefunden. Prüfe Kontingent, Urlaub oder Isochrone-Polygone.</p>
              <button
                type="button"
                onClick={openDebugModal}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-900 underline hover:no-underline"
              >
                <SearchIcon className="w-3 h-3" /> Warum? (Debug-Details)
              </button>
            </div>
          )}

          {/* AAR-522: Top-3 SV-Cards mit inline Slot-Kacheln (1-Click-Reserve) */}
          {topSuggestions && topSuggestions.length > 0 && !showManual && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-gray-500 uppercase font-medium">
                  {topSuggestions.length} Vorschläge · Klick auf Slot reserviert sofort
                </p>
                <button
                  type="button"
                  onClick={reloadTop}
                  disabled={pending || topLoading}
                  className="text-[10px] text-[#4573A2] hover:text-[#3a6290] flex items-center gap-1"
                >
                  <RefreshCwIcon className="w-3 h-3" /> neu laden
                </button>
              </div>

              <div className="space-y-2">
                {topSuggestions.map((sv) => (
                  <SvCard
                    key={sv.svId}
                    sv={sv}
                    slots={sv.slots}
                    pending={pending}
                    wunschterminIso={wunschterminIso ?? null}
                    onReserveSlot={(iso) => handleReserveSlot(sv.svId, iso)}
                  />
                ))}
              </div>

              {/* „Weitere SVs anzeigen" + Manuelle Zeit */}
              <div className="flex items-center gap-3 pt-1">
                {!extraSuggestions && (
                  <button
                    type="button"
                    onClick={loadExtraSvs}
                    disabled={extraLoading}
                    className="text-[11px] text-[#4573A2] hover:underline flex items-center gap-1"
                  >
                    <MapPinIcon className="w-3 h-3" />
                    {extraLoading ? 'Lade …' : '+ Weitere SVs anzeigen'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  className="text-[11px] text-gray-500 hover:underline flex items-center gap-1"
                >
                  <ClockIcon className="w-3 h-3" />
                  Manuelle Zeit-Auswahl
                </button>
              </div>

              {/* Extra-Liste (SV 4-8 ohne inline Slots) */}
              {extraSuggestions && extraSuggestions.length > 0 && (
                <div className="border-t border-gray-100 pt-2 space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase font-medium">
                    Weitere Kandidaten
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {extraSuggestions.map((s) => {
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
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                isSel ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {s.paket}
                            </span>
                          </div>
                          <div
                            className={`flex items-center gap-3 mt-1 text-[11px] ${
                              isSel ? 'text-white/80' : 'text-gray-500'
                            }`}
                          >
                            <span>{s.distanzKm.toFixed(1)} km</span>
                            <span>Score {s.score.toFixed(1)}</span>
                            <span>{s.kontingentFrei} frei</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {extraSuggestions && extraSuggestions.length === 0 && (
                <p className="text-[11px] text-gray-400 italic">
                  Keine weiteren Kandidaten in Reichweite.
                </p>
              )}
            </div>
          )}

          {/* Slot-Auswahl für Extra-SV (kein inline Cache → lade nach) */}
          {selectedSv && !topSuggestions?.some((t) => t.svId === selectedSv.svId) && !showManual && (
            <div className="space-y-3 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-gray-400" />
                  <p className="text-xs font-medium text-gray-700">
                    Slots bei <span className="text-[#0D1B3E]">{selectedSv.name}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSv(null)}
                  className="text-[10px] text-[#4573A2] hover:underline"
                >
                  Zurück
                </button>
              </div>
              {slotsLoading ? (
                <p className="text-[11px] text-gray-400 italic">Lade Slots …</p>
              ) : freeSlots.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {freeSlots.map((slot) => (
                    <SlotKachel
                      key={slot.start}
                      slot={slot}
                      pending={pending}
                      onClick={() => handleReserveSlot(selectedSv.svId, slot.start)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 italic">
                  Keine Slots verfügbar — Manuelle Zeit-Auswahl nutzen.
                </p>
              )}
            </div>
          )}

          {/* Manuelle Zeit-Auswahl (Toggle) */}
          {showManual && (
            <div className="space-y-3 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-700">Manuelle Zeit-Auswahl</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowManual(false)
                    setSelectedSv(null)
                  }}
                  className="text-[10px] text-[#4573A2] hover:underline"
                >
                  Zurück zu Vorschlägen
                </button>
              </div>
              {!selectedSv && topSuggestions && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                    SV auswählen
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {([...(topSuggestions ?? []), ...(extraSuggestions ?? [])] as SvSuggestion[]).map((s) => {
                      return (
                        <button
                          key={s.svId}
                          type="button"
                          onClick={() => setSelectedSv(s)}
                          className="w-full text-left px-3 py-2 rounded-lg border bg-white border-gray-200 hover:border-[#4573A2] hover:bg-blue-50 transition-colors"
                        >
                          <span className="text-sm font-medium">{s.name}</span>
                          <span className="ml-2 text-[10px] text-gray-500">
                            {s.distanzKm.toFixed(1)} km · {s.kontingentFrei} frei
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {selectedSv && (
                <>
                  <p className="text-[11px] text-gray-600">
                    Termin bei <span className="font-medium">{selectedSv.name}</span>
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
                  <button
                    type="button"
                    disabled={pending || !startDatum || !startZeit}
                    onClick={handleReserve}
                    className="w-full text-sm font-medium px-3 py-2.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <CalendarCheckIcon className="w-4 h-4" />
                    {pending ? 'Reserviere …' : `Termin reservieren (${dauerMin} min)`}
                  </button>
                </>
              )}
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

      {debugOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDebugOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-[#0D1B3E]">SV-Matching Debug</h3>
              <button
                type="button"
                onClick={() => setDebugOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-3 space-y-3">
              {debugLoading && <p className="text-xs text-gray-500">Lade Debug-Daten…</p>}
              {debugError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                  {debugError}
                </p>
              )}
              {debugData && (
                <>
                  <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
                    <div>Fall-Koordinaten: {debugData.fallLat.toFixed(5)}, {debugData.fallLng.toFixed(5)}</div>
                    <div>
                      {debugData.passend} von {debugData.gesamt} aktiven SVs passen.
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {debugData.results.map((r) => {
                      const ok = r.status === 'passt'
                      return (
                        <div
                          key={r.svId}
                          className={`text-xs rounded-lg border p-2 ${
                            ok
                              ? 'border-emerald-200 bg-emerald-50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-[#0D1B3E]">{r.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              {r.paket}
                            </span>
                          </div>
                          <div className={`mt-0.5 ${ok ? 'text-emerald-800' : 'text-gray-700'}`}>
                            {ok ? '✓ ' : '✕ '}
                            {r.grund}
                          </div>
                          <div className="mt-1 text-[10px] text-gray-500 flex flex-wrap gap-x-2 gap-y-0.5">
                            <span>Distanz: {r.distanzKm != null ? `${r.distanzKm}km` : '—'}</span>
                            <span>Radius: {r.radius}km</span>
                            <span>Kontingent frei: {r.kontingentFrei}</span>
                            <span>
                              Isochrone: {r.hatIsochrone
                                ? r.isochroneValid
                                  ? r.imPolygon
                                    ? 'im Polygon'
                                    : 'außerhalb'
                                  : 'unlesbar'
                                : 'keine'}
                            </span>
                            {r.imUrlaub && <span className="text-amber-700">Urlaub aktiv</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AAR-522: Sub-Components für SV-Card + Slot-Kachel
// ─────────────────────────────────────────────────────────────

function SvCard({
  sv,
  slots,
  pending,
  wunschterminIso,
  onReserveSlot,
}: {
  sv: SvSuggestion
  slots: SlotCandidate[]
  pending: boolean
  wunschterminIso: string | null
  onReserveSlot: (iso: string) => void
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#0D1B3E] truncate">{sv.name}</p>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500">
            <span>{sv.distanzKm.toFixed(1)} km</span>
            <span>Score {sv.score.toFixed(1)}</span>
            <span>{sv.kontingentFrei} frei</span>
            {sv.offeneFaelle > 0 && <span>{sv.offeneFaelle} offen</span>}
          </div>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium whitespace-nowrap shrink-0">
          {sv.paket}
        </span>
      </div>

      {/* Wunschtermin-Indikator auf Card-Ebene */}
      {sv.verfuegbarAmWunschtermin === true && wunschterminIso && (
        <p className="text-[10px] text-emerald-700 flex items-center gap-1">
          <CheckIcon className="w-3 h-3" />
          Am Wunschtermin {new Date(wunschterminIso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} verfügbar
        </p>
      )}

      {slots.length === 0 ? (
        <p className="text-[11px] text-amber-700 italic">
          Keine automatischen Slots in 12 Wochen — Manuelle Eingabe nötig.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          {slots.map((slot) => (
            <SlotKachel
              key={slot.start}
              slot={slot}
              pending={pending}
              onClick={() => onReserveSlot(slot.start)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SlotKachel({
  slot,
  pending,
  onClick,
}: {
  slot: SlotCandidate
  pending: boolean
  onClick: () => void
}) {
  const start = new Date(slot.start)
  const end = new Date(slot.end)
  const tag = start.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
  const von = start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  const bis = end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  const badge = MATCH_BADGE[slot.matchType]
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="px-2 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-left disabled:opacity-50 flex flex-col gap-0.5"
    >
      {badge && (
        <span className={`inline-block self-start text-[9px] px-1.5 py-0.5 rounded font-medium border ${badge.cls}`}>
          {badge.label}
        </span>
      )}
      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-900">
        <CalendarCheckIcon className="w-3 h-3" />
        {tag}
      </span>
      <span className="text-[11px] text-gray-700">
        {von} – {bis}
      </span>
    </button>
  )
}
