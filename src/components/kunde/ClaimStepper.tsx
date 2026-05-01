// CMM-32f: Kombinierter 4-Phasen-Stepper für die Kunde-Fallseite.
// Zeigt erfassung → begutachtung → regulierung → abschluss mit der
// aktiven Subphase inline beim aktuellen Hauptschritt.
// Side-Quests (Nachbesichtigung/Stellungnahme während Regulierung) werden
// als zusätzliche Zeile unter dem Stepper angezeigt.

import React from 'react'
import { CheckIcon, ClipboardListIcon, WrenchIcon, ShieldCheckIcon, FlagIcon, AlertTriangleIcon, CalendarIcon, NavigationIcon } from 'lucide-react'
import KundeTerminVerschiebenButton from '@/components/kunde/KundeTerminVerschiebenButton'
import TerminLiveStatus from '@/components/kunde/TerminLiveStatus'
import {
  MAIN_PHASE_LABEL,
  SUBPHASE_LABEL,
  type ClaimMainPhase,
  type ClaimLifecycle,
} from '@/lib/claims/lifecycle'

const MAIN_PHASES: { key: ClaimMainPhase; icon: typeof ClipboardListIcon }[] = [
  { key: 'erfassung', icon: ClipboardListIcon },
  { key: 'begutachtung', icon: WrenchIcon },
  { key: 'regulierung', icon: ShieldCheckIcon },
  { key: 'abschluss', icon: FlagIcon },
]

const MAIN_PHASE_INDEX: Record<ClaimMainPhase, number> = {
  erfassung: 0,
  begutachtung: 1,
  regulierung: 2,
  abschluss: 3,
}

type TerminInfo = {
  /** Termin-ID — für „Termin verschieben"-Trigger */
  terminId: string
  /** Datum formatiert für Anzeige (z.B. „Mo. 05.05.2026") */
  datum: string
  /** Uhrzeit formatiert (z.B. „14:00") */
  uhrzeit: string
  /** Adresse für Anzeige + Navigation */
  adresse: string | null
  /** SV-Vorname (nur Vorname — AAR-858 Anonymität) */
  svVorname?: string | null
  /** Kunde-Vorname für die "X ist da"-Anzeige im Live-Status */
  kundeVorname?: string | null
  /** Termin-Status — bei 'bestaetigt' wird der Verschieben-Button gezeigt */
  status?: string | null
  /** Termin ist verstrichen (start_zeit + 60min vorbei + nicht durchgeführt). */
  verstrichen?: boolean
}

/** AAR-864: Notice-Item das als verschmolzene Bottom-Sektion im Stepper
 *  gerendert wird. sortAt = Zeitpunkt für chronologische Sortierung
 *  (oldest first → der zuerst eingetroffene Banner steht ganz oben). */
export type StepperNotice = {
  key: string
  /** ISO-String oder Date — null sortiert als oldest. */
  sortAt: string | Date | null
  /** Tönung des Trennlinien-Borders. 'amber' für Warn-/Pending-Notices,
   *  'navy' (default) für Standard. */
  tone?: 'amber' | 'navy'
  node: React.ReactNode
}

export default function ClaimStepper({
  lifecycle,
  bottomSlot,
  notices,
  terminInfo,
}: {
  lifecycle: ClaimLifecycle
  /** Legacy: einzelne Verlegungs-Banner-Sektion. Wird durch notices
   *  abgelöst, bleibt für Rückwärtskompatibilität. */
  bottomSlot?: React.ReactNode
  /** AAR-864: mehrere verschmolzene Bottom-Sektionen, chronologisch
   *  sortiert (oldest first). */
  notices?: StepperNotice[]
  /** AAR-864 Polish: Termin-Sektion analog zum SV-Header — Datum, Uhrzeit,
   *  Adresse, Navi-Button. Wird über den notices/bottomSlot gerendert. */
  terminInfo?: TerminInfo | null
}) {
  const aktuellIdx = MAIN_PHASE_INDEX[lifecycle.mainPhase]
  const abgeschlossen = lifecycle.mainPhase === 'abschluss'
  const terminVerstrichen = !!terminInfo?.verstrichen
  const noShowCount = lifecycle.kundeNoShowCount ?? 0

  const outerCls = terminVerstrichen
    ? 'rounded-2xl bg-white border-2 border-rose-400 overflow-hidden'
    : bottomSlot
      ? 'rounded-2xl bg-white border-2 border-amber-400 overflow-hidden'
      : 'rounded-2xl bg-white border border-claimondo-border overflow-hidden'

  return (
    <div className={outerCls}>
      <div className="px-4 sm:px-6 py-4 space-y-3">
      {noShowCount > 0 && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 flex items-center gap-2">
          <AlertTriangleIcon className="w-4 h-4 text-rose-600 shrink-0" />
          <p className="text-[11px] font-medium text-rose-800">
            {noShowCount === 1
              ? '1 Termin wurde verpasst'
              : `${noShowCount} Termine wurden verpasst`}
          </p>
        </div>
      )}
      <div className="flex items-center w-full">
        {MAIN_PHASES.map((p, i) => {
          const isCurrent = !abgeschlossen && i === aktuellIdx
          const isDone = abgeschlossen || i < aktuellIdx
          // AAR-864: Begutachtungs-Phase amber + Warndreieck wenn eine
          // Verlegung pending ist (= bottomSlot gesetzt).
          // Verstrichen: Begutachtungs-Phase rot + Warndreieck.
          const istVerlegungWarn = !!bottomSlot && p.key === 'begutachtung'
          const istVerstrichenWarn = terminVerstrichen && p.key === 'begutachtung'
          const Icon = istVerlegungWarn || istVerstrichenWarn ? AlertTriangleIcon : p.icon
          return (
            <React.Fragment key={p.key}>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    istVerstrichenWarn
                      ? 'bg-rose-500 text-white ring-2 ring-rose-300'
                      : istVerlegungWarn
                        ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                        : isDone
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                            ? 'bg-claimondo-navy text-white ring-2 ring-claimondo-navy/20'
                            : 'bg-claimondo-border/40 text-claimondo-ondo/60'
                  }`}
                >
                  {istVerstrichenWarn || istVerlegungWarn || !isDone ? <Icon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
                </div>
                <div className="flex flex-col min-w-0">
                  <p
                    className={`text-sm font-semibold whitespace-nowrap ${
                      istVerstrichenWarn
                        ? 'text-rose-700'
                        : istVerlegungWarn
                          ? 'text-amber-700'
                          : isCurrent
                            ? 'text-claimondo-navy'
                            : isDone
                              ? 'text-emerald-700'
                              : 'text-claimondo-ondo/60'
                    }`}
                  >
                    {MAIN_PHASE_LABEL[p.key]}
                  </p>
                  {isCurrent && (
                    <p className="text-[11px] text-claimondo-ondo whitespace-nowrap mt-0.5">
                      {SUBPHASE_LABEL[lifecycle.subPhase]}
                    </p>
                  )}
                </div>
              </div>
              {i < MAIN_PHASES.length - 1 && (
                <div
                  className={`flex-1 h-px mx-2 sm:mx-4 ${isDone ? 'bg-emerald-300' : 'bg-claimondo-border'}`}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Side-Quests (Nachbesichtigung / Stellungnahme während Regulierung) */}
      {lifecycle.aktiveSideQuests.length > 0 && (
        <div className="border-t border-claimondo-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-1.5">
            Zusätzlich aktiv
          </p>
          <div className="flex flex-wrap gap-2">
            {lifecycle.aktiveSideQuests.map((auftrag) => (
              <span
                key={auftrag.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 border border-violet-200 px-3 py-1 text-xs font-medium text-violet-700"
              >
                {auftrag.typ === 'nachbesichtigung' ? 'Nachbesichtigung' : 'Stellungnahme'}
                <span className="text-violet-500">· {SUBPHASE_LABEL[
                  auftrag.status === 'termin' ? 'termin'
                  : auftrag.status === 'besichtigung' ? 'besichtigung'
                  : 'gutachten'
                ]}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      </div>
      {/* AAR-864: Termin-Sektion analog SV-Header — sichtbar wenn Termin
          existiert und keine Verlegung pending. */}
      {terminInfo && !bottomSlot && (
        <div
          className={`border-t px-4 sm:px-6 py-3.5 ${
            terminVerstrichen ? 'border-rose-300 bg-rose-50/40' : 'border-claimondo-navy/10'
          }`}
        >
          {terminVerstrichen && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 mb-1.5">
              <AlertTriangleIcon className="w-3 h-3" />
              Termin verstrichen — kein Status erfasst
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <CalendarIcon className={`w-4 h-4 shrink-0 ${terminVerstrichen ? 'text-rose-700' : 'text-claimondo-navy'}`} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p
                    className={`text-sm font-semibold ${
                      terminVerstrichen ? 'text-rose-700 line-through' : 'text-claimondo-navy'
                    }`}
                  >
                    {terminInfo.datum}, {terminInfo.uhrzeit} Uhr
                  </p>
                  {!terminVerstrichen && (
                    <TerminLiveStatus
                      terminId={terminInfo.terminId}
                      svVorname={terminInfo.svVorname}
                      kundeVorname={terminInfo.kundeVorname}
                    />
                  )}
                </div>
                {terminInfo.adresse && (
                  <p className="text-xs text-claimondo-ondo truncate">
                    {terminInfo.adresse}
                    {terminInfo.svVorname && ` · ${terminInfo.svVorname}`}
                  </p>
                )}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {terminVerstrichen ? (
                <KundeTerminVerschiebenButton
                  terminId={terminInfo.terminId}
                  label="Neuen Termin vereinbaren"
                  variant="primary"
                />
              ) : terminInfo.status === 'bestaetigt' ? (
                <KundeTerminVerschiebenButton terminId={terminInfo.terminId} />
              ) : null}
              {!terminVerstrichen && terminInfo.adresse && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(terminInfo.adresse)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-claimondo-navy hover:bg-claimondo-navy/90 text-white text-sm font-medium px-3 py-1.5 transition-colors"
                >
                  <NavigationIcon className="w-3.5 h-3.5" />
                  Navigation
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      {bottomSlot}
    </div>
  )
}
