'use client'

// Task 3: AssignFromMapDrawer — Drawer für die Dispatch-Cockpit-Karte.
// Lädt SV-Vorschläge mit Slots (getSvSuggestionsWithSlots), rendert Kandidaten-
// Karten + Slot-Buttons mit Bestätigungs-Schritt, schreibt bei Auswahl via
// reserveSvTerminForLead. Meldet der Karte per Callbacks welche SVs hervorgehoben
// werden sollen (onCandidates) und welcher gerade gehovert wird (onPreviewSv).

import { useState, useEffect, useTransition } from 'react'
import { CalendarCheckIcon, MapPinIcon, XIcon } from 'lucide-react'
import { Drawer, Button } from '@/components/primitives'
import { StatusBadge } from '@/components/shared/StatusBadge'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import {
  getSvSuggestionsWithSlots,
  reserveSvTerminForLead,
} from '@/app/dispatch/leads/[id]/actions'
import type { SvSuggestion, SlotCandidate, SlotMatchType } from '@/app/dispatch/leads/[id]/actions'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AssignFromMapDrawerProps {
  leadId: string
  leadName: string
  onCandidates: (svIds: string[]) => void   // nach Laden: alle Kandidaten-svIds → Karte hebt hervor
  onPreviewSv: (svId: string | null) => void // Hover eines Kandidaten → Linie zeichnen
  onAssigned: () => void                      // nach erfolgreichem Reserve
  onClose: () => void
}

// ─── Match-Badge-Config (analog SvDispatchPanel) ─────────────────────────────

const MATCH_BADGE: Record<SlotMatchType, { label: string; cls: string } | null> = {
  wunschtermin: { label: 'Wunschtermin', cls: 'bg-success-soft text-success-strong border-success/30' },
  gleicher_tag: { label: 'Gleicher Tag', cls: 'bg-claimondo-bg text-claimondo-navy border-claimondo-border' },
  nahe: { label: 'Nahe', cls: 'bg-warning-soft text-warning-strong border-warning/30' },
  nach: null,
}

// ─── Lokale Typen ─────────────────────────────────────────────────────────────

type SvMitSlots = SvSuggestion & { slots: SlotCandidate[] }

interface BestaetigungState {
  sv: SvMitSlots
  slot: SlotCandidate
}

// ─── Slot-Kachel (schlank nachgebaut nach SvDispatchPanel Z.880–920) ──────────

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
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
  const von = start.toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  })
  const bis = end.toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  })
  const badge = MATCH_BADGE[slot.matchType]

  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="px-2 py-1.5 rounded-ios-lg border border-success/30 bg-success-soft hover:bg-success/20 text-left disabled:opacity-50 flex flex-col gap-0.5 transition-colors"
    >
      {badge && (
        <span
          className={`inline-block self-start text-[9px] px-1.5 py-0.5 rounded-ios-sm font-medium border ${badge.cls}`}
        >
          {badge.label}
        </span>
      )}
      <span className="flex items-center gap-1 text-[11px] font-medium text-success-strong">
        <CalendarCheckIcon className="w-3 h-3" />
        {tag}
      </span>
      <span className="text-[11px] text-claimondo-navy">
        {von} – {bis}
      </span>
    </button>
  )
}

// ─── Kandidaten-Karte (schlank nachgebaut nach SvDispatchPanel Z.809–878) ────

function SvKandidatCard({
  sv,
  pending,
  onSlotKlick,
  onMouseEnter,
  onMouseLeave,
}: {
  sv: SvMitSlots
  pending: boolean
  onSlotKlick: (slot: SlotCandidate) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  return (
    <div
      className="rounded-ios-lg border border-claimondo-border bg-white p-3 space-y-2 cursor-default"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Kopfzeile: Name + Paket-Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-body-sm font-medium text-claimondo-navy truncate">{sv.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-caption text-claimondo-ondo flex items-center gap-1">
              <MapPinIcon className="w-3 h-3" />
              {sv.distanzKm.toFixed(1)} km
            </span>
            <span className="text-caption text-claimondo-ondo">
              {sv.etaFromBueroMin != null ? `~${sv.etaFromBueroMin} Min` : '—'}
            </span>
            <span className="text-caption text-claimondo-ondo">
              {sv.kontingentFrei} frei
            </span>
            <span className="text-caption text-claimondo-ondo">
              Score {sv.score.toFixed(1)}
            </span>
          </div>
        </div>
        <StatusBadge tone="neutral" className="whitespace-nowrap shrink-0">
          {sv.paket}
        </StatusBadge>
      </div>

      {/* Gründe (Matching-Reasons) */}
      {sv.reasons.length > 0 && (
        <ul className="space-y-0.5">
          {sv.reasons.map((r, i) => (
            <li key={i} className="text-caption text-claimondo-ondo">
              · {r}
            </li>
          ))}
        </ul>
      )}

      {/* Slot-Kacheln */}
      {sv.slots.length === 0 ? (
        <p className="text-caption text-warning-strong italic">
          Keine automatischen Slots — manuelle Eingabe nötig.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {sv.slots.map((slot) => (
            <SlotKachel
              key={slot.start}
              slot={slot}
              pending={pending}
              onClick={() => onSlotKlick(slot)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Bestätigungs-Dialog (Inline) ────────────────────────────────────────────

function BestaetigungsPanel({
  sv,
  slot,
  pending,
  onBestaetigen,
  onAbbrechen,
}: {
  sv: SvMitSlots
  slot: SlotCandidate
  pending: boolean
  onBestaetigen: () => void
  onAbbrechen: () => void
}) {
  const start = new Date(slot.start)
  const datumZeit = start.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="rounded-ios-lg border border-warning/40 bg-warning-soft/40 p-4 space-y-3">
      <p className="text-body-sm font-semibold text-claimondo-navy">
        Wirklich zuweisen?
      </p>
      <p className="text-body-sm text-claimondo-navy">
        <span className="font-medium">{sv.name}</span> wird für{' '}
        <span className="font-medium">{datumZeit} Uhr</span> eingeplant.
        Der SV erhält eine Benachrichtigung.
      </p>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onAbbrechen}
          disabled={pending}
          type="button"
        >
          Abbrechen
        </Button>
        <Button
          variant="navy"
          size="sm"
          onClick={onBestaetigen}
          loading={pending}
          type="button"
        >
          Zuweisen
        </Button>
      </div>
    </div>
  )
}

// ─── Haupt-Drawer ────────────────────────────────────────────────────────────

export default function AssignFromMapDrawer({
  leadId,
  leadName,
  onCandidates,
  onPreviewSv,
  onAssigned,
  onClose,
}: AssignFromMapDrawerProps) {
  const [suggestions, setSuggestions] = useState<SvMitSlots[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [bestaetigung, setBestaetigung] = useState<BestaetigungState | null>(null)
  const [pending, startTransition] = useTransition()

  // ── Laden beim Mount ───────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(null)

    getSvSuggestionsWithSlots(leadId, { slotsPerSv: 3, maxSvs: 3, slotDauerMin: 45 })
      .then((r) => {
        if (r.success) {
          const s = r.suggestions ?? []
          setSuggestions(s)
          onCandidates(s.map((x) => x.svId))
        } else {
          setError(r.error ?? 'SV-Suche fehlgeschlagen')
        }
      })
      .catch((e: unknown) => {
        setError(String(e))
      })
      .finally(() => setLoading(false))

    // Cleanup beim Unmount: Karte-Hervorhebungen zurücksetzen
    return () => {
      onCandidates([])
      onPreviewSv(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  // ── Toast-Auto-Clear ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Slot-Klick → Bestätigungs-UI ──────────────────────────────────────────
  function handleSlotKlick(sv: SvMitSlots, slot: SlotCandidate) {
    setBestaetigung({ sv, slot })
  }

  // ── Bestätigung → reserveSvTerminForLead ──────────────────────────────────
  function handleBestaetigen() {
    if (!bestaetigung) return
    const { sv, slot } = bestaetigung

    startTransition(async () => {
      const r = await reserveSvTerminForLead(leadId, sv.svId, slot.start, 45)
      if (r.success) {
        setToast('SV zugewiesen — Termin reserviert')
        setBestaetigung(null)
        onAssigned()
      } else {
        setToast(r.error ?? 'Zuweisung fehlgeschlagen')
      }
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Drawer
      open
      onClose={onClose}
      side="right"
      width={480}
      ariaLabel="SV zuweisen"
      noPadding
      hideCloseButton
    >
      <div className="flex flex-col h-full">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-claimondo-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-heading-sm font-semibold text-claimondo-navy">
              SV zuweisen
            </h2>
            <p className="text-caption text-claimondo-ondo truncate mt-0.5">
              {leadName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-ios-sm hover:bg-claimondo-bg text-claimondo-ondo transition-colors"
            aria-label="Schließen"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* ── Toast ──────────────────────────────────────────────────── */}
        {toast && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-ios-md bg-claimondo-bg border border-claimondo-border text-body-sm text-claimondo-navy">
            {toast}
          </div>
        )}

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Bestätigungs-Panel (inline, vor der Liste) */}
          {bestaetigung && (
            <BestaetigungsPanel
              sv={bestaetigung.sv}
              slot={bestaetigung.slot}
              pending={pending}
              onBestaetigen={handleBestaetigen}
              onAbbrechen={() => setBestaetigung(null)}
            />
          )}

          {/* Lade-Zustand */}
          {loading && !bestaetigung && (
            <LoadingSkeleton variant="card" count={3} />
          )}

          {/* Fehler-Zustand */}
          {!loading && error && !bestaetigung && (
            <div className="rounded-ios-md border border-danger/30 bg-danger-soft/30 p-4">
              <p className="text-body-sm font-semibold text-danger-strong mb-1">
                Fehler beim Laden
              </p>
              <p className="text-body-sm text-claimondo-navy">{error}</p>
              <button
                type="button"
                className="mt-3 text-body-sm text-claimondo-navy underline"
                onClick={() => {
                  setLoading(true)
                  setError(null)
                  getSvSuggestionsWithSlots(leadId, { slotsPerSv: 3, maxSvs: 3, slotDauerMin: 45 })
                    .then((r) => {
                      if (r.success) {
                        const s = r.suggestions ?? []
                        setSuggestions(s)
                        onCandidates(s.map((x) => x.svId))
                      } else {
                        setError(r.error ?? 'SV-Suche fehlgeschlagen')
                      }
                    })
                    .catch((e: unknown) => setError(String(e)))
                    .finally(() => setLoading(false))
                }}
              >
                Erneut versuchen
              </button>
            </div>
          )}

          {/* Leer-Zustand */}
          {!loading && !error && suggestions !== null && suggestions.length === 0 && !bestaetigung && (
            <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-6 text-center">
              <p className="text-body-sm font-medium text-claimondo-navy mb-1">
                Kein passender SV gefunden
              </p>
              <p className="text-caption text-claimondo-ondo">
                Bitte prüfe den Unfallort und die Verfügbarkeiten manuell.
              </p>
            </div>
          )}

          {/* Kandidaten-Liste */}
          {!loading && !error && suggestions && suggestions.length > 0 && !bestaetigung && (
            <>
              <p className="text-caption text-claimondo-ondo">
                {suggestions.length} {suggestions.length === 1 ? 'Kandidat' : 'Kandidaten'} gefunden — Slot auswählen zum Zuweisen:
              </p>
              {suggestions.map((sv) => (
                <SvKandidatCard
                  key={sv.svId}
                  sv={sv}
                  pending={pending}
                  onSlotKlick={(slot) => handleSlotKlick(sv, slot)}
                  onMouseEnter={() => onPreviewSv(sv.svId)}
                  onMouseLeave={() => onPreviewSv(null)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </Drawer>
  )
}
