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

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
  ScaleIcon,
  HandshakeIcon,
  BriefcaseIcon,
  DownloadIcon,
  ClockIcon,
} from 'lucide-react'
import { setKanzleiWunsch, resetKanzleiWunsch } from '@/lib/kanzlei-wunsch/actions'
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

export type AnspruchPosition = {
  key: string
  label: string
  /** Optionaler Sub-Text fuer Erklaerung (z.B. „12 Tage × 65 €/Tag"). */
  detail?: string | null
  betragEur: number
}

export type BegutachtungEvent = {
  /** Stable React-Key */
  key: string
  /** Kurze Beschreibung des Events */
  label: string
  /** Optionaler Sub-Text (z.B. „durch Kunde" / „SV nicht erschienen") */
  detail?: string | null
  /** ISO-Zeitstempel — Pflicht; ohne Datum kein Event in der Historie */
  datum: string
  /** Visueller Akzent — done (gruen), warn (amber), error (rose), neutral */
  variant?: 'done' | 'warn' | 'error' | 'neutral'
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
  begutachtungEvents,
  anspruchPositionen,
  kanzleiWunsch,
  kanzleiUebergebenAm,
  ausfallSlot,
  claimId,
  gutachtenFreigegeben,
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
  /** Begutachtungs-Historie — chronologische Events (Termin verschoben,
   *  Termin wahrgenommen, Gutachten erstellt, QC bestanden). Wird im
   *  Begutachtungs-Detail-Panel gerendert. */
  begutachtungEvents?: BegutachtungEvent[]
  /** Anspruchs-Positionen — wie sich die Anspruchssumme zusammensetzt
   *  (Reparatur, Minderwert, Nutzungsausfall, ...). Wird im Regulierungs-
   *  und Abschluss-Panel unter der grossen Summe gerendert. */
  anspruchPositionen?: AnspruchPosition[]
  /** Kanzlei-Wunsch — entscheidet ueber Label-Switch (LexDrive vs. eigene
   *  Kanzlei) und Sonder-Pfad-Visuals. */
  kanzleiWunsch?:
    | 'partnerkanzlei'
    | 'eigene_kanzlei'
    | 'keine_kanzlei'
    | 'noch_unentschieden'
    | 'nicht_gefragt'
    | null
  /** Zeitstempel des Kanzleipaket-Versands an externe Kanzlei. */
  kanzleiUebergebenAm?: string | null
  /** CMM-32 Polish: Mietwagen/Nutzungsausfall-Block — wird im
   *  Regulierungs-/Abschluss-Panel unter den Positionen gerendert.
   *  Page liefert die fertige Card als ReactNode. */
  ausfallSlot?: React.ReactNode
  /** CMM-32 Polish: Claim-ID fuer das lila Top-Banner (Kanzlei-Wunsch-
   *  Frage). Ohne ClaimId rendert das Banner nicht. */
  claimId?: string | null
  /** TRUE wenn Gutachten QC-freigegeben ist. Steuert das Top-Banner. */
  gutachtenFreigegeben?: boolean
}) {
  const aktuellIdx = MAIN_PHASE_INDEX[lifecycle.mainPhase]
  const abgeschlossen = lifecycle.mainPhase === 'abschluss'
  const terminVerstrichen = !!terminInfo?.verstrichen

  // CMM-32 Polish: Klickbare Phase-Auswahl. Default = aktuelle Phase.
  const [selectedPhase, setSelectedPhase] = useState<ClaimMainPhase>(
    lifecycle.mainPhase,
  )

  // Zwei-Schritt Kanzlei-Auswahl: erst Vergleichs-Panel zeigen, dann speichern.
  const [confirmingLexDrive, setConfirmingLexDrive] = useState(false)
  const [confirmingEigeneKanzlei, setConfirmingEigeneKanzlei] = useState(false)

  // Pro Phase ein subtiler Token-Hintergrund — wird sowohl auf den
  // Step-Button (selected) als auch auf das Detail-Panel angewandt.
  // Erfassung + Abschluss = emerald (Done/Erfolg), Begutachtung = navy
  // (aktive Klassik), Regulierung = shield-blau (Geld-Phase).
  const PHASE_BG: Record<ClaimMainPhase, string> = {
    erfassung: 'bg-emerald-50',
    begutachtung: 'bg-claimondo-navy/[0.06]',
    regulierung: 'bg-[#7BA3CC]/15',
    abschluss: 'bg-emerald-50',
  }
  const noShowCount = lifecycle.kundeNoShowCount ?? 0
  // Gutachten ist QC-freigegeben und an die Kanzlei uebergeben sobald
  // der Claim in der Regulierungs- oder Abschluss-Phase ist und eine
  // Gutachten-URL existiert.
  const gutachtenFertig =
    !!gutachtenUrl &&
    (lifecycle.mainPhase === 'regulierung' || lifecycle.mainPhase === 'abschluss')

  // CMM-32 Polish: Lila Kanzlei-Wunsch-Banner — sichtbar wenn QC durch,
  // kein Kanzlei-Wunsch gesetzt UND noch keine Vollmacht in der DB.
  // Liegt eine Vollmacht vor → Kanzleipaket geht nach QC automatisch raus,
  // Kunde muss nichts wählen → Banner entfällt.
  const zeigeKanzleiWunschBanner =
    !!gutachtenFreigegeben &&
    !!claimId &&
    !lead?.vollmacht_signiert_am &&
    (kanzleiWunsch === 'noch_unentschieden' ||
      kanzleiWunsch === 'nicht_gefragt' ||
      kanzleiWunsch == null)

  // LexDrive Vollmacht-Gate: Wrapper wird blau (#0e5be9) sobald der Kunde
  // partnerkanzlei gewählt hat aber die Vollmacht noch nicht bestätigt ist
  // (kanzlei_uebergeben_am = null → Paket noch nicht raus).
  const lexdriveVollmachtAusstehend =
    kanzleiWunsch === 'partnerkanzlei' && !kanzleiUebergebenAm

  // Wrapper-Border haengt am AKTUELLEN Claim-Status (mainPhase + Warn/Error-
  // Bedingungen), nicht an der vom User selektierten Phase. Reihenfolge:
  //   1. Error (Termin verpasst)             → rose
  //   2. Warnung (Verlegung pending)          → amber
  //   3. Kanzlei-Wunsch offen (noch offen)   → violet
  //   4. Eigene-Kanzlei-Vergleich            → yellow-400
  //   5. LexDrive Bestätigung / ausstehend   → #0e5be9 (LexDrive-Blau)
  //   6. Abschluss (Auszahlung eingegangen)   → emerald
  //   7. Sonst                                → neutral
  const outerCls = terminVerstrichen
    ? 'rounded-2xl bg-white border-2 border-rose-400 overflow-hidden'
    : bottomSlot
      ? 'rounded-2xl bg-white border-2 border-amber-400 overflow-hidden'
      : (zeigeKanzleiWunschBanner && !confirmingLexDrive && !confirmingEigeneKanzlei)
        ? 'rounded-2xl bg-white border-2 border-violet-400 overflow-hidden'
        : confirmingEigeneKanzlei
          ? 'rounded-2xl bg-white border-2 border-yellow-400 overflow-hidden'
          : (confirmingLexDrive || lexdriveVollmachtAusstehend)
            ? 'rounded-2xl bg-white border-2 border-[#0e5be9] overflow-hidden'
            : lifecycle.mainPhase === 'abschluss'
              ? 'rounded-2xl bg-white border-2 border-emerald-400 overflow-hidden'
              : 'rounded-2xl bg-white border border-claimondo-border overflow-hidden'

  return (
    <div className={outerCls}>
      <div className="px-4 sm:px-6 py-5 sm:py-6 space-y-4">
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
          // Begutachtungs-Phase wird lila gefaerbt wenn:
          //   a) eigene_kanzlei gewählt (visueller Hinweis alternativer Pfad)
          //   b) Kanzlei-Wunsch-Banner sichtbar (= Vollmacht fehlt noch,
          //      Kunde muss sich entscheiden — pending-State)
          const istEigeneKanzleiPfad =
            (kanzleiWunsch === 'eigene_kanzlei' || zeigeKanzleiWunschBanner) &&
            p.key === 'begutachtung'
          // Regulierungs-Kreis spiegelt die Wrapper-Farbe je nach Kanzlei-Wahl wider.
          const istKanzleiRegulierung = p.key === 'regulierung' &&
            (zeigeKanzleiWunschBanner || confirmingLexDrive || confirmingEigeneKanzlei || lexdriveVollmachtAusstehend)
          const kanzleiRegCircleCls = confirmingLexDrive || lexdriveVollmachtAusstehend
            ? 'bg-[#0e5be9] text-white ring-2 ring-[#0e5be9]/30'
            : confirmingEigeneKanzlei
              ? 'bg-yellow-400 text-white ring-2 ring-yellow-300'
              : 'bg-violet-500 text-white ring-2 ring-violet-300'
          const kanzleiRegLabelCls = confirmingLexDrive || lexdriveVollmachtAusstehend
            ? 'text-[#0a3fa0]'
            : confirmingEigeneKanzlei
              ? 'text-amber-700'
              : 'text-violet-700'
          const kanzleiRegIcon = confirmingLexDrive || lexdriveVollmachtAusstehend
            ? HandshakeIcon
            : confirmingEigeneKanzlei
              ? BriefcaseIcon
              : ScaleIcon
          const Icon = istVerlegungWarn || istVerstrichenWarn
            ? AlertTriangleIcon
            : istKanzleiRegulierung
              ? kanzleiRegIcon
              : p.icon
          const isSelected = selectedPhase === p.key
          return (
            <React.Fragment key={p.key}>
              <button
                type="button"
                onClick={() => setSelectedPhase(p.key)}
                aria-pressed={isSelected}
                className={`flex items-center gap-2 sm:gap-3 shrink-0 rounded-xl px-2 py-2.5 -mx-2 -my-1 transition-colors hover:bg-claimondo-navy/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-navy/40 ${
                  isSelected ? PHASE_BG[p.key] : ''
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    istVerstrichenWarn
                      ? 'bg-rose-500 text-white ring-2 ring-rose-300'
                      : istVerlegungWarn
                        ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                        : istEigeneKanzleiPfad
                          ? 'bg-violet-500 text-white ring-2 ring-violet-300'
                          : istKanzleiRegulierung
                            ? kanzleiRegCircleCls
                            : isDone
                              ? 'bg-emerald-500 text-white'
                              : isCurrent
                                ? 'bg-claimondo-navy text-white ring-2 ring-claimondo-navy/20'
                                : 'bg-claimondo-border/40 text-claimondo-ondo/60'
                  }`}
                >
                  {istVerstrichenWarn || istVerlegungWarn || istKanzleiRegulierung || !isDone
                    ? <Icon className="w-4 h-4" />
                    : <CheckIcon className="w-4 h-4" />}
                </div>
                <div className="flex flex-col min-w-0 text-left">
                  <p
                    className={`text-sm font-semibold whitespace-nowrap ${
                      istVerstrichenWarn
                        ? 'text-rose-700'
                        : istVerlegungWarn
                          ? 'text-amber-700'
                          : istEigeneKanzleiPfad
                            ? 'text-violet-700'
                            : istKanzleiRegulierung
                              ? kanzleiRegLabelCls
                              : isCurrent
                                ? 'text-claimondo-navy'
                                : isDone
                                  ? 'text-emerald-700'
                                  : 'text-claimondo-ondo/60'
                    }`}
                  >
                    {zeigeKanzleiWunschBanner && p.key === 'begutachtung'
                    ? 'Kanzlei'
                    : MAIN_PHASE_LABEL[p.key]}
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

      {/* Kanzlei-Wunsch: Auswahloptionen — immer sichtbar solange banner aktiv.
          Hintergrundton wechselt je nach selektierter Option. */}
      {zeigeKanzleiWunschBanner && claimId && (
        <div className={`border-t-2 px-4 sm:px-6 py-4 ${
          confirmingLexDrive
            ? 'border-[#0e5be9]/40 bg-[#0e5be9]/[0.03]'
            : confirmingEigeneKanzlei
              ? 'border-yellow-300 bg-yellow-50/60'
              : 'border-violet-300 bg-violet-50'
        }`}>
          <KanzleiWunschBanner
            claimId={claimId}
            onLexDriveClick={() => { setConfirmingEigeneKanzlei(false); setConfirmingLexDrive(true) }}
            onEigeneKanzleiClick={() => { setConfirmingLexDrive(false); setConfirmingEigeneKanzlei(true) }}
            confirmingLexDrive={confirmingLexDrive}
            confirmingEigeneKanzlei={confirmingEigeneKanzlei}
          />
        </div>
      )}
      {/* LexDrive Bestätigungs-Panel — zeigt vollen Anspruch + Konditionen */}
      {confirmingLexDrive && claimId && (
        <div className="border-t-2 border-[#0e5be9] bg-[#0e5be9]/[0.04] px-4 sm:px-6 py-5">
          <LexDriveBestaetigenPanel
            claimId={claimId}
            anspruchVsEur={anspruchVsEur ?? null}
            anspruchPositionen={anspruchPositionen}
            ausfallSlot={ausfallSlot}
          />
        </div>
      )}
      {/* Eigene-Kanzlei Vergleichs-Panel — zeigt Anspruch ohne LexDrive-Extras */}
      {confirmingEigeneKanzlei && claimId && (
        <div className="border-t-2 border-yellow-400 bg-yellow-50/50 px-4 sm:px-6 py-5">
          <EigeneKanzleiAnspruchPanel
            claimId={claimId}
            anspruchVsEur={anspruchVsEur ?? null}
            anspruchPositionen={anspruchPositionen}
          />
        </div>
      )}

      {/* Test-Reset: Wahl zurücksetzen — sichtbar wenn Wunsch gesetzt + Paket noch nicht raus */}
      {claimId &&
        kanzleiWunsch &&
        !['noch_unentschieden', 'nicht_gefragt'].includes(kanzleiWunsch) &&
        !kanzleiUebergebenAm && (
        <ResetKanzleiWunschButton claimId={claimId} kanzleiWunsch={kanzleiWunsch} />
      )}

      {/* LexDrive Vollmacht-Gate: Hard-Block bis LexDrive den vollmacht_bestaetigt
          Webhook schickt. Wrapper-Border faerbt sich #0e5be9 (LexDrive-Blau).
          Nach Bestätigung → Kanzleipaket raus → kanzlei_uebergeben_am gesetzt
          → Gate fällt weg, normaler Stepper. */}
      {lexdriveVollmachtAusstehend && (
        <div className="border-t-2 border-[#0e5be9] bg-[#0e5be9]/[0.05] px-4 sm:px-6 py-4">
          <LexDriveVollmachtGate />
        </div>
      )}

      {/* CMM-32 Polish: Erfassungs-Detail-Panel — Lead-Status. */}
      {selectedPhase === 'erfassung' && !bottomSlot && (
        <div className={`border-t border-claimondo-navy/10 px-4 sm:px-6 py-3.5 ${PHASE_BG.erfassung}`}>
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
          + Kanzlei-Sub-Stepper. Nur sichtbar wenn eine Vollmacht vorliegt
          (vollmacht_signiert_am gesetzt) — ohne Vollmacht zeigen wir den
          Anspruch im Kanzlei-Wunsch-Banner-Flow stattdessen. */}
      {(selectedPhase === 'regulierung' || selectedPhase === 'abschluss') && !bottomSlot && !!lead?.vollmacht_signiert_am && (
        <div
          className={`border-t border-claimondo-navy/10 px-4 sm:px-6 py-4 ${
            selectedPhase === 'regulierung' ? PHASE_BG.regulierung : PHASE_BG.abschluss
          }`}
        >
          {anspruchVsEur != null ? (
            <>
              <p
                className={`text-[10px] uppercase tracking-wider font-semibold ${
                  selectedPhase === 'abschluss'
                    ? 'text-emerald-800/80'
                    : 'text-claimondo-navy/70'
                }`}
              >
                Dein Anspruch gegen die Versicherung
              </p>
              <p
                className={`text-3xl font-bold mt-1 ${
                  selectedPhase === 'abschluss'
                    ? 'text-emerald-900'
                    : 'text-claimondo-navy'
                }`}
              >
                {anspruchVsEur.toLocaleString('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                })}
              </p>
              {anspruchPositionen && anspruchPositionen.length > 0 && (
                <div className="mt-3 rounded-lg border border-claimondo-border/60 bg-white/60 backdrop-blur-sm p-3">
                  <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/80 font-semibold mb-1.5">
                    Wie sich der Anspruch zusammensetzt
                  </p>
                  <ul className="space-y-1 text-xs">
                    {anspruchPositionen.map((pos) => (
                      <li key={pos.key} className="flex items-baseline gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-claimondo-navy">{pos.label}</p>
                          {pos.detail && (
                            <p className="text-[11px] text-claimondo-ondo/70">{pos.detail}</p>
                          )}
                        </div>
                        <span className="font-medium text-claimondo-navy whitespace-nowrap">
                          {pos.betragEur.toLocaleString('de-DE', {
                            style: 'currency',
                            currency: 'EUR',
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-claimondo-ondo">
              Die Anspruchssumme wird berechnet, sobald das Gutachten freigegeben ist.
            </p>
          )}

          {/* CMM-32 Polish: Mietwagen/Nutzungsausfall-Slot — semantisch
              gehoert das zum Anspruch (XOR Mietwagen ODER Nutzungsausfall),
              also direkt unter die Positionen-Aufschluesselung. */}
          {ausfallSlot && <div className="mt-3">{ausfallSlot}</div>}

          {/* Kanzlei-Sub-Stepper */}
          {kanzleiFall && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <KanzleiSubStep
                done={!!kanzleiFall.vs_kontakt_am}
                icon={<MailIcon className="w-3 h-3" />}
                label={
                  kanzleiWunsch === 'partnerkanzlei'
                    ? 'Versicherung kontaktiert durch LexDrive'
                    : 'Versicherung kontaktiert'
                }
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

      {/* CMM-32 Polish: Begutachtungs-Historie — alle Events mit Datum
          (Termin verschoben, Termin wahrgenommen, Gutachten erstellt,
          QC bestanden). Sichtbar bei selectedPhase=begutachtung sobald
          mindestens 1 Event existiert. Dient vor allem dem nachtraeglichen
          Nachvollziehen wenn der Kunde nach Regulierung zurueckklickt. */}
      {selectedPhase === 'begutachtung' &&
        !bottomSlot &&
        begutachtungEvents &&
        begutachtungEvents.length > 0 && (
          <div className={`border-t border-claimondo-navy/10 px-4 sm:px-6 py-3.5 ${PHASE_BG.begutachtung}`}>
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/80 font-semibold mb-2">
              Verlauf der Begutachtung
            </p>
            <ol className="space-y-2 text-xs">
              {begutachtungEvents.map((ev) => (
                <BegutachtungEventRow key={ev.key} ev={ev} />
              ))}
            </ol>
          </div>
        )}

      {bottomSlot}
    </div>
  )
}

function KanzleiWunschBanner({
  claimId,
  onLexDriveClick,
  onEigeneKanzleiClick,
  confirmingLexDrive,
  confirmingEigeneKanzlei,
}: {
  claimId: string
  onLexDriveClick: () => void
  onEigeneKanzleiClick: () => void
  confirmingLexDrive: boolean
  confirmingEigeneKanzlei: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const confirmingAny = confirmingLexDrive || confirmingEigeneKanzlei

  function pick(wunsch: 'partnerkanzlei' | 'eigene_kanzlei' | 'keine_kanzlei') {
    if (wunsch === 'partnerkanzlei') { onLexDriveClick(); return }
    if (wunsch === 'eigene_kanzlei') { onEigeneKanzleiClick(); return }
    setError(null)
    startTransition(async () => {
      const r = await setKanzleiWunsch(claimId, wunsch)
      if (!r.ok) setError(r.error ?? 'Speichern fehlgeschlagen')
      else router.refresh()
    })
  }

  const headerColor = confirmingLexDrive ? 'text-[#0a3fa0]' : confirmingEigeneKanzlei ? 'text-amber-900' : 'text-violet-900'
  const subColor = confirmingLexDrive ? 'text-[#0e5be9]/70' : confirmingEigeneKanzlei ? 'text-amber-800/80' : 'text-violet-800/90'
  const iconColor = confirmingLexDrive ? 'text-[#0e5be9]' : confirmingEigeneKanzlei ? 'text-amber-600' : 'text-violet-700'

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <ScaleIcon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${headerColor}`}>
            Wer übernimmt die Schadenregulierung?
          </p>
          <p className={`text-xs mt-0.5 ${subColor}`}>
            Dein Gutachten ist fertig und QC-geprüft. Bevor wir an die Versicherung
            gehen, brauchen wir deine Wahl — das ist eine juristische Entscheidung.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <BannerOption
          icon={<HandshakeIcon className="w-3.5 h-3.5" />}
          titel="Komplettservice"
          subtitel="LexDrive übernimmt"
          onClick={() => pick('partnerkanzlei')}
          disabled={pending}
          active={confirmingLexDrive}
          activeColor="blue"
          dimmed={confirmingAny && !confirmingLexDrive}
        />
        <BannerOption
          icon={<BriefcaseIcon className="w-3.5 h-3.5" />}
          titel="Eigene Kanzlei"
          subtitel="Wir senden Paket an deine Kanzlei"
          onClick={() => pick('eigene_kanzlei')}
          disabled={pending}
          active={confirmingEigeneKanzlei}
          activeColor="yellow"
          dimmed={confirmingAny && !confirmingEigeneKanzlei}
        />
        <BannerOption
          icon={<DownloadIcon className="w-3.5 h-3.5" />}
          titel="Selbst einreichen"
          subtitel="Du regelst es direkt mit der VS"
          onClick={() => pick('keine_kanzlei')}
          disabled={pending}
          dimmed={confirmingAny}
        />
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

function BannerOption({
  icon,
  titel,
  subtitel,
  onClick,
  disabled,
  active,
  activeColor,
  dimmed,
}: {
  icon: React.ReactNode
  titel: string
  subtitel: string
  onClick: () => void
  disabled: boolean
  active?: boolean
  activeColor?: 'blue' | 'yellow'
  dimmed?: boolean
}) {
  const activeCls =
    active && activeColor === 'blue'
      ? 'border-[#0e5be9] bg-[#0e5be9]/[0.07] ring-1 ring-[#0e5be9]/30'
      : active && activeColor === 'yellow'
        ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-300'
        : null
  const normalCls = 'border-violet-200 bg-white hover:border-violet-400 hover:bg-violet-100'
  const iconTextCls =
    active && activeColor === 'blue'
      ? 'text-[#0e5be9]'
      : active && activeColor === 'yellow'
        ? 'text-amber-600'
        : 'text-violet-700'
  const titleTextCls =
    active && activeColor === 'blue'
      ? 'text-[#0a3fa0]'
      : active && activeColor === 'yellow'
        ? 'text-amber-900'
        : 'text-claimondo-navy'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-lg border px-3 py-2 transition-colors disabled:opacity-40 ${activeCls ?? normalCls} ${dimmed ? 'opacity-40' : ''}`}
    >
      <div className={`flex items-center gap-1.5 font-semibold text-xs ${iconTextCls}`}>
        {icon}
        <span className={titleTextCls}>{titel}</span>
      </div>
      <p className="text-[11px] text-claimondo-ondo mt-0.5">{subtitel}</p>
    </button>
  )
}

function BegutachtungEventRow({ ev }: { ev: BegutachtungEvent }) {
  const variant = ev.variant ?? 'done'
  const dotCls =
    variant === 'error'
      ? 'bg-rose-500'
      : variant === 'warn'
        ? 'bg-amber-500'
        : variant === 'neutral'
          ? 'bg-claimondo-border'
          : 'bg-emerald-500'
  const datum = new Date(ev.datum)
  const datumStr = Number.isNaN(datum.getTime())
    ? ev.datum
    : datum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const uhrzeit = Number.isNaN(datum.getTime())
    ? null
    : datum.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return (
    <li className="flex items-start gap-2.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${dotCls}`} />
      <div className="flex-1 min-w-0">
        <p className="text-claimondo-navy font-medium">{ev.label}</p>
        {ev.detail && <p className="text-claimondo-ondo">{ev.detail}</p>}
      </div>
      <span className="text-[11px] text-claimondo-ondo whitespace-nowrap">
        {datumStr}
        {uhrzeit && <span className="text-claimondo-ondo/60"> · {uhrzeit}</span>}
      </span>
    </li>
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

function ResetKanzleiWunschButton({
  claimId,
  kanzleiWunsch,
}: {
  claimId: string
  kanzleiWunsch: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const label: Record<string, string> = {
    partnerkanzlei: 'LexDrive',
    eigene_kanzlei: 'Eigene Kanzlei',
    keine_kanzlei: 'Selbst einreichen',
  }
  function reset() {
    startTransition(async () => {
      await resetKanzleiWunsch(claimId)
      router.refresh()
    })
  }
  return (
    <div className="border-t border-claimondo-border/40 px-4 sm:px-6 py-2 flex items-center justify-between bg-[#f8f9fb]">
      <p className="text-[11px] text-claimondo-ondo">
        Gewählt: <span className="font-medium text-claimondo-navy">{label[kanzleiWunsch] ?? kanzleiWunsch}</span>
      </p>
      <button
        type="button"
        onClick={reset}
        disabled={pending}
        className="text-[11px] text-claimondo-ondo hover:text-rose-600 underline underline-offset-2 disabled:opacity-40"
      >
        Wahl zurücksetzen
      </button>
    </div>
  )
}

function LexDriveBestaetigenPanel({
  claimId,
  anspruchVsEur,
  anspruchPositionen,
  ausfallSlot,
}: {
  claimId: string
  anspruchVsEur: number | null
  anspruchPositionen?: AnspruchPosition[]
  ausfallSlot?: React.ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function bestaetigen() {
    startTransition(async () => {
      const r = await setKanzleiWunsch(claimId, 'partnerkanzlei')
      if (!r.ok) { setError(r.error ?? 'Fehler beim Speichern'); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HandshakeIcon className="w-4 h-4 text-[#0e5be9] shrink-0" />
        <p className="text-sm font-semibold text-[#0a3fa0]">Komplettservice durch LexDrive</p>
      </div>

      {/* Voller Anspruchsblock — Positionen + Nutzungsausfall-Slot */}
      {anspruchVsEur != null && (
        <div className="rounded-xl border border-claimondo-border bg-white px-4 py-3 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-claimondo-ondo/70 mb-0.5">
              Dein Anspruch gegen die Versicherung
            </p>
            <p className="text-3xl font-bold text-claimondo-navy">
              {anspruchVsEur.toLocaleString('de-DE', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
          {anspruchPositionen && anspruchPositionen.length > 0 && (
            <div className="rounded-lg border border-claimondo-border/60 bg-[#f8f9fb] p-3">
              <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-1.5">
                Wie sich der Anspruch zusammensetzt
              </p>
              <ul className="space-y-1 text-xs">
                {anspruchPositionen.map((pos) => (
                  <li key={pos.key} className="flex items-baseline gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-claimondo-navy">{pos.label}</p>
                      {pos.detail && (
                        <p className="text-[11px] text-claimondo-ondo/60">{pos.detail}</p>
                      )}
                    </div>
                    <span className="font-medium text-claimondo-navy whitespace-nowrap">
                      {pos.betragEur.toLocaleString('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ausfallSlot && (
            <div className="rounded-lg bg-[#0e5be9]/[0.06] border border-[#0e5be9]/20 p-3">
              {ausfallSlot}
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-3">
        <p className="flex-1 text-xs text-[#0a3fa0]/80 leading-relaxed">
          Abgewickelt in ~20 Tagen + Vollservice durch unser Team. Du erhältst
          25&nbsp;€ Auslagenpauschale. Für dich völlig kostenfrei, unabhängig
          von Kürzung oder Teilschuld.
        </p>
        <button
          type="button"
          onClick={bestaetigen}
          disabled={pending}
          className="shrink-0 bg-[#0e5be9] hover:bg-[#0a3fa0] active:bg-[#0a3fa0] text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
        >
          Bestätigen
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

// Schlüssel-Fragmente die aus dem Eigene-Kanzlei-Vergleich rausgefiltert werden.
// LexDrive-exklusive Positionen: Nutzungsausfall (LexDrive holt ihn aktiv durch)
// und Auslagenpauschale (25€ nur bei LexDrive).
const EIGENE_KANZLEI_EXCLUDE = ['nutzungsausfall', 'mietwagen', 'auslagenpauschale']

function EigeneKanzleiAnspruchPanel({
  claimId,
  anspruchVsEur,
  anspruchPositionen,
}: {
  claimId: string
  anspruchVsEur: number | null
  anspruchPositionen?: AnspruchPosition[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const gefiltert = (anspruchPositionen ?? []).filter(
    (p) => !EIGENE_KANZLEI_EXCLUDE.some((k) => p.key.toLowerCase().includes(k)),
  )
  const gefiltertTotal = gefiltert.reduce((s, p) => s + p.betragEur, 0)
  const anzeigeBetrag = gefiltert.length > 0 ? gefiltertTotal : (anspruchVsEur ?? null)

  function bestaetigen() {
    startTransition(async () => {
      const r = await setKanzleiWunsch(claimId, 'eigene_kanzlei')
      if (!r.ok) { setError(r.error ?? 'Fehler beim Speichern'); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BriefcaseIcon className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-sm font-semibold text-amber-900">Eigene Kanzlei</p>
      </div>

      {anzeigeBetrag != null && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-300 px-4 py-3 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-amber-700/70 mb-0.5">
              Dein Anspruch (ohne LexDrive-Extras)
            </p>
            <p className="text-3xl font-bold text-amber-900">
              {anzeigeBetrag.toLocaleString('de-DE', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
          {gefiltert.length > 0 && (
            <div className="rounded-lg border border-yellow-300/60 bg-white/60 p-3">
              <p className="text-[10px] uppercase tracking-wider text-amber-700/60 font-semibold mb-1.5">
                Enthaltene Positionen
              </p>
              <ul className="space-y-1 text-xs">
                {gefiltert.map((pos) => (
                  <li key={pos.key} className="flex items-baseline gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-amber-900">{pos.label}</p>
                      {pos.detail && (
                        <p className="text-[11px] text-amber-700/60">{pos.detail}</p>
                      )}
                    </div>
                    <span className="font-medium text-amber-900 whitespace-nowrap">
                      {pos.betragEur.toLocaleString('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-700/70 mt-2">
                Nutzungsausfall und Auslagenpauschale sind nicht enthalten — diese holt LexDrive aktiv durch.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-3">
        <p className="flex-1 text-xs text-amber-800/80 leading-relaxed">
          Wir senden dir das Gutachten und alle Unterlagen — deine Kanzlei übernimmt
          die Kommunikation mit der Versicherung.
        </p>
        <button
          type="button"
          onClick={bestaetigen}
          disabled={pending}
          className="shrink-0 bg-amber-500 hover:bg-amber-600 active:bg-amber-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
        >
          Bestätigen
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

function LexDriveVollmachtGate() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-[#0e5be9]/10 flex items-center justify-center shrink-0 mt-0.5">
        <ClockIcon className="w-4 h-4 text-[#0e5be9]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#0a3fa0]">
          Bitte bestätige die Vollmacht
        </p>
        <p className="text-xs text-[#0e5be9]/80 mt-0.5">
          LexDrive hat dir eine Vollmacht per WhatsApp geschickt.{' '}
          <span className="font-semibold text-[#0a3fa0]">Bitte schau auf dein Handy</span>{' '}
          und bestätige sie dort — sobald wir die Rückmeldung haben, geht deine
          Akte automatisch an die Kanzlei. Du musst hier nichts weiter tun.
        </p>
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#0e5be9] animate-pulse" />
          <span className="text-[11px] font-medium text-[#0e5be9]">Warte auf deine Bestätigung</span>
        </div>
      </div>
    </div>
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
