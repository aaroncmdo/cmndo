'use client'

// CMM-32f: Kombinierter 4-Phasen-Stepper für die Kunde-Fallseite.
// Zeigt erfassung → begutachtung → regulierung → abschluss mit der
// aktiven Subphase inline beim aktuellen Hauptschritt.
// Side-Quests (Nachbesichtigung/Stellungnahme während Regulierung) werden
// als zusätzliche Zeile unter dem Stepper angezeigt.
//
// CMM-32 Polish: Steps sind klickbar — der Bottom-Bereich switcht je
// nach selektierter Phase und zeigt die phasenspezifischen Details
// (Erfassung-Status, Termin, Anspruch, Auszahlung). Default ist die
// aktuelle Phase ausgewaehlt.

import React, { useState } from 'react'
import {
  CheckIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  WrenchIcon,
  ShieldCheckIcon,
  FlagIcon,
  AlertTriangleIcon,
  CalendarIcon,
  NavigationIcon,
  FileTextIcon,
  EuroIcon,
  MailIcon,
} from 'lucide-react'
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
  /** CMM-32 Polish: Wer war (laut Geo) nicht da? 'sv' wenn der SV nicht
   *  vor Ort war (sv_angekommen_am IS NULL), 'kunde' wenn der SV da war
   *  aber nichts passiert ist, 'unklar' wenn keine Geo-Daten — dann
   *  zeigen wir zwei Buttons als Fallback. */
  verstrichenInitiator?: 'sv' | 'kunde' | 'unklar'
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
  gutachtenUrl,
  anspruchVsEur,
  lead,
  kanzleiFall,
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
  /** Gutachten-PDF-URL — wenn der Auftrag QC-freigegeben ist und der Fall
   *  in der Regulierung-Phase ist, zeigt der Stepper einen gruenen
   *  Erfolgs-Banner "Gutachten fertig" oben. */
  gutachtenUrl?: string | null
  /** Voraussichtlicher Anspruch gegen die VS in Euro — abgeleitet aus
   *  den OCR-Werten des Gutachtens. Einziger OCR-Wert, den der Kunde
   *  zu sehen bekommt. Null = noch nicht berechenbar. */
  anspruchVsEur?: number | null
  /** Lead-Status fuer das Erfassungs-Detail-Panel. Optional damit
   *  bestehende Aufrufe ohne Lead weiterhin funktionieren. */
  lead?: {
    sa_unterschrieben: boolean | null
    vollmacht_signiert_am: string | null
    onboarding_complete: boolean | null
  } | null
  /** Kanzlei-Fall-Status fuer das Regulierungs-Detail-Panel. */
  kanzleiFall?: {
    status: 'versicherungskontakt' | 'auszahlung'
    vs_kontakt_am: string | null
    ausgezahlt_am: string | null
  } | null
}) {
  const aktuellIdx = MAIN_PHASE_INDEX[lifecycle.mainPhase]
  const abgeschlossen = lifecycle.mainPhase === 'abschluss'
  const terminVerstrichen = !!terminInfo?.verstrichen

  // CMM-32 Polish: Klickbare Phase-Auswahl. Default = aktuelle Phase.
  const [selectedPhase, setSelectedPhase] = useState<ClaimMainPhase>(
    lifecycle.mainPhase,
  )
  const noShowCount = lifecycle.kundeNoShowCount ?? 0
  // Gutachten ist QC-freigegeben und an die Kanzlei uebergeben sobald
  // der Claim in der Regulierungs- oder Abschluss-Phase ist und eine
  // Gutachten-URL existiert.
  const gutachtenFertig =
    !!gutachtenUrl &&
    (lifecycle.mainPhase === 'regulierung' || lifecycle.mainPhase === 'abschluss')

  const outerCls = terminVerstrichen
    ? 'rounded-2xl bg-white border-2 border-rose-400 overflow-hidden'
    : bottomSlot
      ? 'rounded-2xl bg-white border-2 border-amber-400 overflow-hidden'
      : 'rounded-2xl bg-white border border-claimondo-border overflow-hidden'

  return (
    <div className={outerCls}>
      <div className="px-4 sm:px-6 py-4 space-y-3">
      {gutachtenFertig && (
        <a
          href={gutachtenUrl ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 flex items-center gap-3 hover:bg-emerald-100 transition-colors"
        >
          <CheckCircleIcon className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-900">
              Ihr Gutachten ist fertig und wurde der Kanzlei übermittelt!
            </p>
            {anspruchVsEur != null ? (
              <p className="text-xs text-emerald-800/90 mt-0.5">
                Ihr Anspruch an die Versicherung:{' '}
                <span className="font-semibold">
                  {anspruchVsEur.toLocaleString('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                    maximumFractionDigits: 0,
                  })}
                </span>
              </p>
            ) : (
              <p className="text-xs text-emerald-800/80">PDF ansehen oder herunterladen</p>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 shrink-0">
            <FileTextIcon className="w-3.5 h-3.5" />
            Gutachten ansehen
          </span>
        </a>
      )}
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
          const isSelected = selectedPhase === p.key
          return (
            <React.Fragment key={p.key}>
              <button
                type="button"
                onClick={() => setSelectedPhase(p.key)}
                aria-pressed={isSelected}
                className={`flex items-center gap-2 sm:gap-3 shrink-0 rounded-lg p-1 -m-1 transition-colors hover:bg-claimondo-navy/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-navy/40 ${
                  isSelected ? 'bg-claimondo-navy/[0.06]' : ''
                }`}
              >
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
                <div className="flex flex-col min-w-0 text-left">
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
              </button>
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
      {/* CMM-32 Polish: Erfassungs-Detail-Panel — Lead-Status. */}
      {selectedPhase === 'erfassung' && !bottomSlot && (
        <div className="border-t border-claimondo-navy/10 px-4 sm:px-6 py-3.5">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/80 font-semibold mb-2">
            Erfassung
          </p>
          <ul className="space-y-1.5 text-xs">
            <ChecklistItem
              done={!!lead?.sa_unterschrieben}
              label="Sicherungsabtretung unterschrieben"
            />
            <ChecklistItem
              done={!!lead?.vollmacht_signiert_am}
              label="Vollmacht signiert"
              datum={lead?.vollmacht_signiert_am ?? null}
            />
            <ChecklistItem
              done={!!lead?.onboarding_complete}
              label="Onboarding abgeschlossen"
            />
          </ul>
          {lifecycle.mainPhase === 'erfassung' && (
            <p className="text-[11px] text-claimondo-ondo mt-2">
              Aktueller Schritt: {SUBPHASE_LABEL[lifecycle.subPhase]}
            </p>
          )}
        </div>
      )}

      {/* CMM-32 Polish: Regulierungs- und Abschluss-Detail-Panel — Anspruch
          + Kanzlei-Sub-Stepper. Auch sichtbar wenn der User auf eine
          zukuenftige Phase klickt, die noch nicht erreicht ist (zeigt
          dann „steht noch aus"-Hinweis). */}
      {(selectedPhase === 'regulierung' || selectedPhase === 'abschluss') && !bottomSlot && (
        <div className="border-t border-claimondo-navy/10 px-4 sm:px-6 py-4 bg-emerald-50/40">
          {anspruchVsEur != null ? (
            <>
              <p className="text-[10px] uppercase tracking-wider text-emerald-800/80 font-semibold">
                Dein Anspruch gegen die Versicherung
              </p>
              <p className="text-3xl font-bold text-emerald-900 mt-1">
                {anspruchVsEur.toLocaleString('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                })}
              </p>
            </>
          ) : (
            <p className="text-xs text-claimondo-ondo">
              Die Anspruchssumme wird berechnet, sobald das Gutachten freigegeben ist.
            </p>
          )}

          {/* Kanzlei-Sub-Stepper */}
          {kanzleiFall && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <KanzleiSubStep
                done={!!kanzleiFall.vs_kontakt_am}
                icon={<MailIcon className="w-3 h-3" />}
                label="Versicherung kontaktiert"
                datum={kanzleiFall.vs_kontakt_am}
              />
              <div
                className={`flex-1 h-px ${kanzleiFall.vs_kontakt_am ? 'bg-emerald-400' : 'bg-claimondo-border'}`}
              />
              <KanzleiSubStep
                done={!!kanzleiFall.ausgezahlt_am}
                icon={<EuroIcon className="w-3 h-3" />}
                label="Auszahlung"
                datum={kanzleiFall.ausgezahlt_am}
              />
            </div>
          )}

          <p className="text-xs text-claimondo-ondo mt-3">
            {selectedPhase === 'abschluss' && lifecycle.mainPhase === 'abschluss'
              ? 'Auszahlung eingegangen — Fall abgeschlossen.'
              : selectedPhase === 'abschluss'
                ? 'Steht noch aus — wird abgeschlossen, sobald die Auszahlung eingegangen ist.'
                : kanzleiFall?.status === 'auszahlung'
                  ? 'Versicherung hat zugesagt — Auszahlung läuft.'
                  : kanzleiFall
                    ? 'Wir holen das Geld bei der gegnerischen Versicherung. Du musst nichts tun.'
                    : 'Steht noch aus — startet sobald das Gutachten an die Kanzlei übermittelt ist.'}
          </p>
        </div>
      )}

      {/* AAR-864: Termin-Sektion analog SV-Header — sichtbar wenn die
          Begutachtungs-Phase ausgewaehlt ist und ein Termin existiert. */}
      {selectedPhase === 'begutachtung' &&
        terminInfo &&
        !bottomSlot && (
        <div
          className={`border-t px-4 sm:px-6 py-3.5 ${
            terminVerstrichen ? 'border-rose-300 bg-rose-50/40' : 'border-claimondo-navy/10'
          }`}
        >
          {terminVerstrichen && (
            <div className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-700 mb-1.5">
              <AlertTriangleIcon className="w-3 h-3 mt-0.5 shrink-0" />
              <span>
                {terminInfo.verstrichenInitiator === 'sv'
                  ? 'Gutachter ist nicht erschienen — du kannst einen neuen Termin wählen'
                  : terminInfo.verstrichenInitiator === 'kunde'
                    ? 'Termin verpasst — du warst nicht vor Ort'
                    : 'Termin verstrichen — kein Status erfasst'}
              </span>
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

function ChecklistItem({
  done,
  label,
  datum,
}: {
  done: boolean
  label: string
  datum?: string | null
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
          done ? 'bg-emerald-500 text-white' : 'bg-claimondo-border/60 text-claimondo-ondo'
        }`}
      >
        {done && <CheckIcon className="w-3 h-3" />}
      </span>
      <span className={done ? 'text-claimondo-navy' : 'text-claimondo-ondo'}>{label}</span>
      {datum && (
        <span className="ml-auto text-[10px] text-claimondo-ondo/70">
          {new Date(datum).toLocaleDateString('de-DE')}
        </span>
      )}
    </li>
  )
}

function KanzleiSubStep({
  done,
  icon,
  label,
  datum,
}: {
  done: boolean
  icon: React.ReactNode
  label: string
  datum: string | null
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
          done ? 'bg-emerald-500 text-white' : 'bg-claimondo-border/60 text-claimondo-ondo'
        }`}
      >
        {done ? <CheckIcon className="w-3 h-3" /> : icon}
      </span>
      <div className="flex flex-col">
        <span className={`font-medium ${done ? 'text-emerald-800' : 'text-claimondo-ondo'}`}>
          {label}
        </span>
        {datum && (
          <span className="text-[10px] text-claimondo-ondo/70">
            {new Date(datum).toLocaleDateString('de-DE')}
          </span>
        )}
      </div>
    </div>
  )
}
