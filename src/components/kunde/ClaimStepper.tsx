// CMM-32f: Kombinierter 4-Phasen-Stepper für die Kunde-Fallseite.
// Zeigt erfassung → begutachtung → regulierung → abschluss mit der
// aktiven Subphase inline beim aktuellen Hauptschritt.
// Side-Quests (Nachbesichtigung/Stellungnahme während Regulierung) werden
// als zusätzliche Zeile unter dem Stepper angezeigt.

import React from 'react'
import { CheckIcon, ClipboardListIcon, WrenchIcon, ShieldCheckIcon, FlagIcon, AlertTriangleIcon, CalendarIcon, NavigationIcon } from 'lucide-react'
import KundeTerminVerschiebenButton from '@/components/kunde/KundeTerminVerschiebenButton'
import TerminLiveStatus from '@/components/kunde/TerminLiveStatus'
import { useTranslations } from 'next-intl'
import {
  getVisibleMainPhases,
  type ClaimMainPhase,
  type ClaimLifecycle,
} from '@/lib/claims/lifecycle'

const PHASE_ICON: Record<ClaimMainPhase, typeof ClipboardListIcon> = {
  erfassung: ClipboardListIcon,
  begutachtung: WrenchIcon,
  regulierung: ShieldCheckIcon,
  abschluss: FlagIcon,
}

const ALLE_PHASEN: ClaimMainPhase[] = ['erfassung', 'begutachtung', 'regulierung', 'abschluss']

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
  /** T1: true bei dispatch_pending/sv_gesucht (Dead-Pin/noch-kein-SV) — zeigt "wird bestätigt"-Badge statt TerminLiveStatus */
  pending?: boolean
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
  const tp = useTranslations('phasen')
  const ts = useTranslations('kunde.fall.stepper')
  // AAR-939: nur_gutachter blendet die Regulierungs-Phase aus (kein
  // Regulierungs-Tail). Defensiv: faellt die aktive Phase wider Erwarten nicht
  // in die sichtbare Liste, auf alle 4 Phasen zurueckfallen.
  const visible = getVisibleMainPhases(lifecycle.serviceTyp)
  const phasen = visible.includes(lifecycle.mainPhase) ? visible : ALLE_PHASEN
  const aktuellIdx = phasen.indexOf(lifecycle.mainPhase)
  const abgeschlossen = lifecycle.mainPhase === 'abschluss'

  const outerCls = bottomSlot
    ? 'rounded-2xl bg-white border-2 border-warning overflow-hidden'
    : 'rounded-2xl bg-white border border-claimondo-border overflow-hidden'

  return (
    <div className={outerCls}>
      <div className="px-4 sm:px-6 py-4 space-y-3">
      <div className="flex items-center w-full">
        {phasen.map((key, i) => {
          const isCurrent = !abgeschlossen && i === aktuellIdx
          const isDone = abgeschlossen || i < aktuellIdx
          // AAR-864: Begutachtungs-Phase amber + Warndreieck wenn eine
          // Verlegung pending ist (= bottomSlot gesetzt).
          const istVerlegungWarn = !!bottomSlot && key === 'begutachtung'
          const Icon = istVerlegungWarn ? AlertTriangleIcon : PHASE_ICON[key]
          return (
            <React.Fragment key={key}>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    istVerlegungWarn
                      ? 'bg-warning text-white ring-2 ring-warning/30'
                      : isDone
                        ? 'bg-success text-white'
                        : isCurrent
                          ? 'bg-claimondo-navy text-white ring-2 ring-claimondo-navy/20'
                          : 'bg-claimondo-border/40 text-claimondo-ondo/60'
                  }`}
                >
                  {istVerlegungWarn || !isDone ? <Icon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
                </div>
                <div className="flex flex-col min-w-0">
                  <p
                    className={`text-sm font-semibold whitespace-nowrap ${
                      istVerlegungWarn
                        ? 'text-warning-strong'
                        : isCurrent
                          ? 'text-claimondo-navy'
                          : isDone
                            ? 'text-success-strong'
                            : 'text-claimondo-ondo/60'
                    }`}
                  >
                    {tp(`main.${key}`)}
                  </p>
                  {isCurrent && (
                    <p className="text-[11px] text-claimondo-ondo whitespace-nowrap mt-0.5">
                      {tp(`subKunde.${lifecycle.subPhase}`)}
                    </p>
                  )}
                </div>
              </div>
              {i < phasen.length - 1 && (
                <div
                  className={`flex-1 h-px mx-2 sm:mx-4 ${isDone ? 'bg-success/30' : 'bg-claimondo-border'}`}
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
            {tp('panel.zusaetzlichAktiv')}
          </p>
          <div className="flex flex-wrap gap-2">
            {lifecycle.aktiveSideQuests.map((auftrag) => (
              <span
                key={auftrag.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-claimondo-ondo/[0.06] border border-claimondo-ondo/30 px-3 py-1 text-xs font-medium text-claimondo-navy"
              >
                {tp(`sideQuest.${auftrag.typ === 'nachbesichtigung' ? 'nachbesichtigung' : 'stellungnahme'}`)}
                <span className="text-claimondo-navy">· {tp(`subKunde.${
                  auftrag.status === 'termin' ? 'termin'
                  : auftrag.status === 'besichtigung' ? 'besichtigung'
                  : 'gutachten'
                }`)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      </div>
      {/* AAR-864: Termin-Sektion analog SV-Header — sichtbar wenn Termin
          existiert und keine Verlegung pending. */}
      {terminInfo && !bottomSlot && (
        <div className="border-t border-claimondo-navy/10 px-4 sm:px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <CalendarIcon className="w-4 h-4 shrink-0 text-claimondo-navy" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-semibold text-claimondo-navy">
                    {terminInfo.datum}, {terminInfo.uhrzeit} {ts('uhrSuffix')}
                  </p>
                  {terminInfo.pending ? (
                    <span className="inline-flex items-center rounded-full bg-warning-soft text-warning-strong text-[11px] font-medium px-2 py-0.5">
                      {ts('wirdBestaetigt')}
                    </span>
                  ) : (
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
              {/* AAR-864: Verschieben-Button nur bei bestätigtem Termin */}
              {terminInfo.status === 'bestaetigt' && (
                <KundeTerminVerschiebenButton terminId={terminInfo.terminId} />
              )}
              {terminInfo.adresse && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(terminInfo.adresse)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-ios-lg bg-claimondo-navy hover:bg-claimondo-navy/90 text-white text-sm font-medium px-3 py-1.5 transition-colors"
                >
                  <NavigationIcon className="w-3.5 h-3.5" />
                  {ts('navigation')}
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
