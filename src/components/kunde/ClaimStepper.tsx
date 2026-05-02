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
import { AnimatePresence, motion } from 'framer-motion'
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
  ChevronRightIcon,
  XIcon,
} from 'lucide-react'
import { setKanzleiWunsch, resetKanzleiWunsch, updateKanzleiAnsprechpartner, bestaetigeVollmachtKunde, bestaetigeSelbstEinreichungOhneKanzlei } from '@/lib/kanzlei-wunsch/actions'
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
  /** Termin wurde wahrgenommen (durchgefuehrt_am gesetzt). */
  durchgefuehrt?: boolean
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
  ausfallSlotLexDrive,
  nutzungsausfallBetragEur,
  claimId,
  fallId,
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
    anrede?: string | null
    vorname?: string | null
    nachname?: string | null
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
  /** Gleiche Card wie ausfallSlot, aber mit blauem LexDrive-Styling —
   *  wird im LexDrive-Bestätigungs-Panel gerendert. */
  ausfallSlotLexDrive?: React.ReactNode
  /** Berechneter Nutzungsausfall-Betrag (effTage × Tagessatz) — wird im
   *  LexDrive-Panel auf den Gesamtanspruch addiert. */
  nutzungsausfallBetragEur?: number | null
  /** CMM-32 Polish: Claim-ID fuer das lila Top-Banner (Kanzlei-Wunsch-
   *  Frage). Ohne ClaimId rendert das Banner nicht. */
  claimId?: string | null
  /** Fall-ID — fuer den 'Vollmacht bestaetigen'-Button im LexDrive-Gate. */
  fallId?: string | null
  /** TRUE wenn Gutachten QC-freigegeben ist. Steuert das Top-Banner. */
  gutachtenFreigegeben?: boolean
}) {
  const router = useRouter()
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

  // Optimistischer lokaler Kanzlei-Wunsch — wird bei LexDrive-/Selbst-
  // Bestätigung sofort gesetzt, damit keine router.refresh()-Pause entsteht.
  const [localKanzleiWunsch, setLocalKanzleiWunsch] = useState<
    'partnerkanzlei' | 'keine_kanzlei' | null
  >(null)
  const effectiveKanzleiWunsch = localKanzleiWunsch ?? kanzleiWunsch

  // Optimistische lokale Vollmacht-Bestätigung — Gate verschwindet sofort.
  const [localVollmachtSigniert, setLocalVollmachtSigniert] = useState(false)
  // Optimistisches Selbst-Einreichen-Bestätigt — Stepper springt sofort
  // auf Abschluss, sobald der Kunde den Download triggert.
  const [localSelbstUebergeben, setLocalSelbstUebergeben] = useState(false)

  function handleLexDriveConfirmed() {
    setLocalKanzleiWunsch('partnerkanzlei')
    setConfirmingLexDrive(false)
    setConfirmingEigeneKanzlei(false)
    router.refresh()
  }

  function handleVollmachtConfirmed() {
    setLocalVollmachtSigniert(true)
    // Phase optimistisch auf regulierung — vollstaendiger Anspruchs-/
    // Auszahlungs-Banner soll direkt nach Vollmacht ausfahren.
    setSelectedPhase('regulierung')
    // Sidebar (Layout) re-rendern — die LexDrive-QR-Card wird in der
    // Layout-Server-Component anhand vollmacht_signiert_am geladen, also
    // muss das Layout aktualisiert werden, damit die Card erscheint.
    router.refresh()
  }

  // Selbst-Einreichen: Click auf 'Gutachten herunterladen' loest die
  // Server-Action aus, oeffnet das PDF in neuem Tab und springt im
  // Stepper auf Abschluss.
  const [selbstPending, startSelbst] = useTransition()
  function handleSelbstEinreichenDownload(url: string) {
    if (!claimId) return
    // PDF zuerst oeffnen — sonst blockt Safari den popup-Window-Open im
    // Async-Callback.
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    startSelbst(async () => {
      const r = await bestaetigeSelbstEinreichungOhneKanzlei(claimId)
      if (!r.ok) return
      setLocalSelbstUebergeben(true)
      setSelectedPhase('abschluss')
    })
  }

  // Effektive Vollmacht-Bestaetigung — DB-Wert ODER lokal optimistisch.
  const effectiveVollmachtSigniert = !!lead?.vollmacht_signiert_am || localVollmachtSigniert

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
    !effectiveVollmachtSigniert &&
    (effectiveKanzleiWunsch === 'noch_unentschieden' ||
      effectiveKanzleiWunsch === 'nicht_gefragt' ||
      effectiveKanzleiWunsch == null)

  // LexDrive Vollmacht-Gate: Wrapper wird blau (#0e5be9) sobald der Kunde
  // partnerkanzlei gewählt hat aber die Vollmacht noch nicht bestätigt ist
  // (kanzlei_uebergeben_am = null → Paket noch nicht raus).
  const lexdriveVollmachtAusstehend =
    effectiveKanzleiWunsch === 'partnerkanzlei' &&
    !kanzleiUebergebenAm &&
    !effectiveVollmachtSigniert

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
    ? 'rounded-2xl bg-white border-2 border-rose-400 overflow-hidden transition-colors duration-300'
    : bottomSlot
      ? 'rounded-2xl bg-white border-2 border-amber-400 overflow-hidden transition-colors duration-300'
      : (zeigeKanzleiWunschBanner && !confirmingLexDrive && !confirmingEigeneKanzlei)
        ? 'rounded-2xl bg-white border-2 border-violet-400 overflow-hidden transition-colors duration-300'
        : confirmingEigeneKanzlei
          ? 'rounded-2xl bg-white border-2 border-yellow-400 overflow-hidden transition-colors duration-300'
          : (confirmingLexDrive || lexdriveVollmachtAusstehend)
            ? 'rounded-2xl bg-white border-2 border-[#0e5be9] overflow-hidden transition-colors duration-300'
            : lifecycle.mainPhase === 'abschluss'
              ? 'rounded-2xl bg-white border-2 border-emerald-400 overflow-hidden transition-colors duration-300'
              : 'rounded-2xl bg-white border border-claimondo-border overflow-hidden transition-colors duration-300'

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
          // Optimistisch: Kanzlei-Step (= Begutachtung-Slot) gilt als
          // erledigt sobald die Vollmacht signiert ODER der Selbst-Pfad
          // bestaetigt ODER ein eigene-Kanzlei-Paket versendet wurde.
          // Dann bleibt der Kreis nicht "current" haengen sondern wird gruen.
          const kanzleiStepDone =
            effectiveVollmachtSigniert ||
            localSelbstUebergeben ||
            (effectiveKanzleiWunsch === 'eigene_kanzlei' && !!kanzleiUebergebenAm)
          const isCurrent = !abgeschlossen && i === aktuellIdx &&
            !(p.key === 'begutachtung' && kanzleiStepDone)
          const isDone = abgeschlossen || i < aktuellIdx ||
            (p.key === 'begutachtung' && kanzleiStepDone)
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
              {i < MAIN_PHASES.length - 1 && (() => {
                // Verbindung zwischen Begutachtung (Kanzlei) und Regulierung
                // wird lila, solange die Kanzlei-Wahl noch aussteht (Banner
                // sichtbar / Vollmacht ausstehend). Sobald der Kanzlei-Step
                // erledigt ist (Vollmacht / Selbst / eigene Kanzlei versendet),
                // faellt sie auf emerald (isDone) zurueck.
                const istKanzleiToRegulierung =
                  i === 1 && !!gutachtenFreigegeben && !kanzleiStepDone
                const lineCls = istKanzleiToRegulierung
                  ? 'bg-violet-400'
                  : isDone
                    ? 'bg-emerald-300'
                    : 'bg-claimondo-border'
                return <div className={`flex-1 h-px mx-2 sm:mx-4 transition-colors duration-300 ${lineCls}`} />
              })()}
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
        <motion.div
          layout
          className={`border-t-2 px-4 sm:px-6 py-4 transition-colors duration-300 ${
            confirmingLexDrive
              ? 'border-[#0e5be9]/40 bg-[#0e5be9]/[0.03]'
              : confirmingEigeneKanzlei
                ? 'border-yellow-300 bg-yellow-50/60'
                : 'border-violet-300 bg-violet-50'
          }`}
        >
          <KanzleiWunschBanner
            claimId={claimId}
            onLexDriveClick={() => { setConfirmingEigeneKanzlei(false); setConfirmingLexDrive(true) }}
            onEigeneKanzleiClick={() => { setConfirmingLexDrive(false); setConfirmingEigeneKanzlei(true) }}
            onKeineKanzleiSelected={() => {
              setLocalKanzleiWunsch('keine_kanzlei')
              setConfirmingLexDrive(false)
              setConfirmingEigeneKanzlei(false)
            }}
            confirmingLexDrive={confirmingLexDrive}
            confirmingEigeneKanzlei={confirmingEigeneKanzlei}
          />
        </motion.div>
      )}

      {/* Detail-Panel — ein persistenter Wrapper, Farbe wechselt per CSS,
          nur der Inhalt fährt aus (slide-down rein, slide-up raus). */}
      <AnimatePresence initial={false}>
        {(confirmingLexDrive || confirmingEigeneKanzlei) && claimId && (
          <motion.div
            key="detail-wrapper"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
            className={`border-t-2 px-4 sm:px-6 py-5 transition-colors duration-300 ${
              confirmingLexDrive
                ? 'border-[#0e5be9] bg-[#0e5be9]/[0.04]'
                : 'border-yellow-400 bg-yellow-50/50'
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              {confirmingLexDrive ? (
                <motion.div
                  key="lexdrive-content"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                >
                  <LexDriveBestaetigenPanel
                    claimId={claimId}
                    anspruchVsEur={anspruchVsEur ?? null}
                    anspruchPositionen={anspruchPositionen}
                    ausfallSlot={ausfallSlotLexDrive ?? ausfallSlot}
                    nutzungsausfallBetragEur={nutzungsausfallBetragEur ?? null}
                    onConfirmed={handleLexDriveConfirmed}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="eigene-kanzlei-content"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                >
                  <EigeneKanzleiAnspruchPanel
                    claimId={claimId}
                    anspruchVsEur={anspruchVsEur ?? null}
                    anspruchPositionen={anspruchPositionen}
                    nutzungsausfallBetragEur={nutzungsausfallBetragEur ?? null}
                    kundeAnrede={lead?.anrede ?? null}
                    kundeVorname={lead?.vorname ?? null}
                    kundeNachname={lead?.nachname ?? null}
                    onSwitchToLexDrive={() => {
                      setConfirmingEigeneKanzlei(false)
                      setConfirmingLexDrive(true)
                    }}
                    onLexDriveConfirmed={handleLexDriveConfirmed}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selbst-einreichen-Panel — sobald der Kunde 'keine_kanzlei' gewaehlt
          hat aber noch nicht uebergeben. Click auf Gutachten-Download
          triggert Bestaetigung + Sprung auf Abschluss. */}
      <AnimatePresence initial={false}>
        {effectiveKanzleiWunsch === 'keine_kanzlei' &&
          !kanzleiUebergebenAm &&
          !localSelbstUebergeben &&
          claimId && (
          <motion.div
            key="selbst-einreichen-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
            className="border-t border-claimondo-border bg-white px-4 sm:px-6 py-5"
          >
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <FileTextIcon className="w-4 h-4 text-claimondo-shield shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-claimondo-navy">Dein Gutachten</p>
                  <p className="text-xs text-claimondo-ondo mt-0.5 leading-relaxed">
                    Lade dein Gutachten herunter und reiche es zusammen mit der Schadensanzeige
                    direkt bei der gegnerischen Versicherung ein. Sobald du den Download gestartet
                    hast, geht dein Fall in den Abschluss.
                  </p>
                </div>
              </div>
              {gutachtenUrl ? (
                <button
                  type="button"
                  onClick={() => handleSelbstEinreichenDownload(gutachtenUrl)}
                  disabled={selbstPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-claimondo-navy hover:bg-claimondo-navy/90 text-white text-sm font-semibold px-4 py-2 disabled:opacity-50 transition-colors"
                >
                  <DownloadIcon className="w-4 h-4" />
                  {selbstPending ? 'Wird abgeschlossen…' : 'Gutachten herunterladen'}
                </button>
              ) : (
                <p className="text-[11px] text-claimondo-ondo bg-[#f8f9fb] border border-claimondo-border rounded px-2 py-1.5">
                  Gutachten-Download wird verfügbar sobald die Vollständigkeitsprüfung durch ist.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
      <AnimatePresence initial={false}>
        {lexdriveVollmachtAusstehend && (
          <motion.div
            key="lexdrive-vollmacht-gate"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
            className="border-t-2 border-[#0e5be9] bg-[#0e5be9]/[0.05] px-4 sm:px-6 py-4"
          >
            <LexDriveVollmachtGate
              fallId={fallId ?? null}
              onConfirmed={handleVollmachtConfirmed}
            />
          </motion.div>
        )}
      </AnimatePresence>

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
      <AnimatePresence initial={false}>
      {(selectedPhase === 'regulierung' || selectedPhase === 'abschluss') && !bottomSlot && effectiveVollmachtSigniert && (
        <motion.div
          key={`reg-panel-${selectedPhase}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { duration: 0.4, ease: [0.4, 0, 0.2, 1], delay: 0.25 },
            opacity: { duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: 0.3 },
          }}
          style={{ overflow: 'hidden', transformOrigin: 'top' }}
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

          {/* Kanzlei-Sub-Stepper — immer sichtbar im Regulierungs-Wrapper.
              Wenn noch kein kanzlei_faelle-Row existiert, zeigen wir beide
              Steps als ausstehend. */}
          <div className="mt-3 flex items-center gap-2 text-xs">
            <KanzleiSubStep
              done={!!kanzleiFall?.vs_kontakt_am}
              icon={<MailIcon className="w-3 h-3" />}
              label={
                effectiveKanzleiWunsch === 'partnerkanzlei'
                  ? 'Versicherung kontaktiert durch LexDrive'
                  : 'Versicherung kontaktiert'
              }
              datum={kanzleiFall?.vs_kontakt_am ?? null}
            />
            <div
              className={`flex-1 h-px ${kanzleiFall?.vs_kontakt_am ? 'bg-emerald-400' : 'bg-claimondo-border'}`}
            />
            <KanzleiSubStep
              done={!!kanzleiFall?.ausgezahlt_am}
              icon={<EuroIcon className="w-3 h-3" />}
              label="Auszahlung"
              datum={kanzleiFall?.ausgezahlt_am ?? null}
            />
          </div>

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
        </motion.div>
      )}
      </AnimatePresence>

      {/* AAR-864: Termin-Sektion analog SV-Header — sichtbar wenn die
          Begutachtungs-Phase ausgewaehlt ist und ein Termin existiert.
          Sobald der Termin wahrgenommen wurde (durchgefuehrt_am), brauchen
          wir die Sektion nicht mehr — die Historie zeigt 'Termin
          wahrgenommen' weiter unten. */}
      {selectedPhase === 'begutachtung' &&
        terminInfo &&
        !terminInfo.durchgefuehrt &&
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
  onKeineKanzleiSelected,
  confirmingLexDrive,
  confirmingEigeneKanzlei,
}: {
  claimId: string
  onLexDriveClick: () => void
  onEigeneKanzleiClick: () => void
  onKeineKanzleiSelected?: () => void
  confirmingLexDrive: boolean
  confirmingEigeneKanzlei: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const confirmingAny = confirmingLexDrive || confirmingEigeneKanzlei

  function pick(wunsch: 'partnerkanzlei' | 'eigene_kanzlei' | 'keine_kanzlei') {
    if (wunsch === 'partnerkanzlei') { onLexDriveClick(); return }
    if (wunsch === 'eigene_kanzlei') { onEigeneKanzleiClick(); return }
    setError(null)
    startTransition(async () => {
      const r = await setKanzleiWunsch(claimId, wunsch)
      if (!r.ok) { setError(r.error ?? 'Speichern fehlgeschlagen'); return }
      onKeineKanzleiSelected?.()
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
          titel="Kostenfreier Komplettservice"
          subtitel="LexDrive übernimmt"
          onClick={() => pick('partnerkanzlei')}
          disabled={pending}
          active={confirmingLexDrive}
          activeColor="blue"
          dimmed={confirmingAny && !confirmingLexDrive ? (confirmingEigeneKanzlei ? 'yellow' : true) : false}
        />
        <BannerOption
          icon={<BriefcaseIcon className="w-3.5 h-3.5" />}
          titel="Eigene Kanzlei"
          subtitel="Wir senden Paket an deine Kanzlei"
          onClick={() => pick('eigene_kanzlei')}
          disabled={pending}
          active={confirmingEigeneKanzlei}
          activeColor="yellow"
          dimmed={confirmingAny && !confirmingEigeneKanzlei ? (confirmingLexDrive ? 'blue' : true) : false}
        />
        <BannerOption
          icon={<DownloadIcon className="w-3.5 h-3.5" />}
          titel="Selbst einreichen"
          subtitel="Du regelst es direkt mit der VS"
          onClick={() => pick('keine_kanzlei')}
          disabled={pending}
          dimmed={confirmingAny ? (confirmingLexDrive ? 'blue' : confirmingEigeneKanzlei ? 'yellow' : true) : false}
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
  dimmed?: boolean | 'blue' | 'yellow'
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
        : dimmed === 'blue'
          ? 'text-[#0e5be9]'
          : dimmed === 'yellow'
            ? 'text-amber-600'
            : 'text-violet-700'
  const titleTextCls =
    active && activeColor === 'blue'
      ? 'text-[#0a3fa0]'
      : active && activeColor === 'yellow'
        ? 'text-amber-900'
        : dimmed === 'blue'
          ? 'text-[#0a3fa0]'
          : dimmed === 'yellow'
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
  nutzungsausfallBetragEur,
  onConfirmed,
}: {
  claimId: string
  anspruchVsEur: number | null
  anspruchPositionen?: AnspruchPosition[]
  ausfallSlot?: React.ReactNode
  nutzungsausfallBetragEur?: number | null
  onConfirmed?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function bestaetigen() {
    startTransition(async () => {
      const r = await setKanzleiWunsch(claimId, 'partnerkanzlei')
      if (!r.ok) { setError(r.error ?? 'Fehler beim Speichern'); return }
      onConfirmed?.()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HandshakeIcon className="w-4 h-4 text-[#0e5be9] shrink-0" />
        <p className="text-sm font-semibold text-[#0a3fa0]">Kostenfreier Komplettservice durch LexDrive</p>
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
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 }}
            >
              {ausfallSlot}
            </motion.div>
          )}
        </div>
      )}

      {anspruchVsEur != null && (
        <div className="border-t border-[#0e5be9]/20 pt-3 flex items-end justify-between gap-3">
          <p className="text-xs font-semibold text-[#0e5be9]/70 uppercase tracking-wider shrink-0">Gesamtanspruch</p>
          <div className="text-right">
            <p className="text-3xl font-bold text-[#0e5be9]">
              {(anspruchVsEur + (nutzungsausfallBetragEur ?? 0)).toLocaleString('de-DE', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              })}
            </p>
            <p className="text-xs font-semibold text-[#0e5be9]/60 mt-0.5">+&nbsp;25&nbsp;€ Auslagenpauschale</p>
          </div>
        </div>
      )}

      <div className="flex items-end gap-3">
        <p className="flex-1 text-xs text-[#0a3fa0]/80 leading-relaxed">
          Abgewickelt in ~20 Tagen + Vollservice durch unser Team. Du erhältst
          25&nbsp;€ Auslagenpauschale. Unser Komplettservice inkl. anwaltlicher
          Betreuung ist für dich völlig kostenfrei, unabhängig von Kürzung oder Teilschuld.
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
  nutzungsausfallBetragEur,
  kundeAnrede,
  kundeVorname,
  kundeNachname,
  onSwitchToLexDrive,
  onLexDriveConfirmed,
}: {
  claimId: string
  anspruchVsEur: number | null
  anspruchPositionen?: AnspruchPosition[]
  nutzungsausfallBetragEur?: number | null
  kundeAnrede?: string | null
  kundeVorname?: string | null
  kundeNachname?: string | null
  onSwitchToLexDrive?: () => void
  onLexDriveConfirmed?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [disclaimerAkzeptiert, setDisclaimerAkzeptiert] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'eigene_kanzlei' | 'lexdrive'>('eigene_kanzlei')
  const [kanzleiEmail, setKanzleiEmail] = useState('')

  const gefiltert = (anspruchPositionen ?? []).filter(
    (p) => !EIGENE_KANZLEI_EXCLUDE.some((k) => p.key.toLowerCase().includes(k)),
  )
  const gefiltertTotal = gefiltert.reduce((s, p) => s + p.betragEur, 0)
  const anzeigeBetrag = gefiltert.length > 0 ? gefiltertTotal : (anspruchVsEur ?? null)

  const anredeText =
    kundeAnrede === 'herr' ? 'Herr' : kundeAnrede === 'frau' ? 'Frau' : null
  const vollName = [anredeText, kundeVorname, kundeNachname].filter(Boolean).join(' ') || null

  function bestaetigen() {
    startTransition(async () => {
      const r = await setKanzleiWunsch(claimId, 'eigene_kanzlei')
      if (!r.ok) { setError(r.error ?? 'Fehler beim Speichern'); return }
      if (kanzleiEmail.trim()) {
        await updateKanzleiAnsprechpartner(claimId, { email: kanzleiEmail.trim() })
      }
      setShowModal(false)
      router.refresh()
    })
  }

  function bestaetigenLexDrive() {
    startTransition(async () => {
      const r = await setKanzleiWunsch(claimId, 'partnerkanzlei')
      if (!r.ok) { setError(r.error ?? 'Fehler beim Speichern'); return }
      setShowModal(false)
      onLexDriveConfirmed?.()
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

      <p className="text-xs text-amber-800/80 leading-relaxed">
        Wir senden dir das Gutachten und alle Unterlagen — deine Kanzlei übernimmt
        die Kommunikation mit der Versicherung.
      </p>

      {/* Disclaimer — muss aktiv bestätigt werden */}
      <label className="flex items-start gap-3 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={disclaimerAkzeptiert}
          onChange={(e) => setDisclaimerAkzeptiert(e.target.checked)}
          className="mt-0.5 w-4 h-4 shrink-0 accent-rose-600 cursor-pointer"
        />
        <p className="text-xs text-rose-900 leading-relaxed">
          Hiermit versichere ich
          {vollName ? `, ${vollName},` : ''}{' '}
          der Claimondo GmbH, dass ich mich vollständig eigenständig um die
          Kommunikation mit der Kanzlei &amp; mit dem gegnerischen Versicherer kümmere{' '}
          <span className="font-semibold">und im Besitz einer Rechtsschutzversicherung</span> bin.
        </p>
      </label>

      <AnimatePresence>
        {disclaimerAkzeptiert && (
          <motion.div
            key="disclaimer-actions"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
            className="space-y-2"
          >
            {onSwitchToLexDrive && (
              <button
                type="button"
                onClick={onSwitchToLexDrive}
                className="w-full text-left rounded-xl border-2 border-[#0e5be9] bg-[#0e5be9]/[0.07] hover:bg-[#0e5be9]/[0.13] active:bg-[#0e5be9]/[0.13] px-4 py-3.5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#0e5be9]/15 flex items-center justify-center shrink-0">
                    <HandshakeIcon className="w-4 h-4 text-[#0e5be9]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0a3fa0]">Kostenfreier Komplettservice durch LexDrive</p>
                    <p className="text-xs text-[#0e5be9]/70 mt-0.5">Anwaltliche Betreuung inklusive — für dich vollständig kostenlos</p>
                  </div>
                  <ChevronRightIcon className="w-4 h-4 text-[#0e5be9] shrink-0" />
                </div>
              </button>
            )}
            <button
              type="button"
              onClick={() => { setModalMode('eigene_kanzlei'); setShowModal(true) }}
              className="w-full bg-rose-500/70 hover:bg-rose-500/90 active:bg-rose-600/90 backdrop-blur-sm border border-rose-300/40 shadow-inner text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
            >
              Bestätigen (kein Service)
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="text-xs text-red-700">{error}</p>}

      {/* Modal — roter Glassy-Overlay mit Kanzlei-Email + Vergleich */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            key="eigene-kanzlei-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm bg-black/40"
            onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className={`w-full max-w-md rounded-2xl backdrop-blur-2xl shadow-2xl overflow-hidden transition-colors duration-300 ${
                modalMode === 'lexdrive'
                  ? 'border border-[#0e5be9]/40 bg-[#071e4a]/90'
                  : 'border border-rose-400/30 bg-red-950/80'
              }`}
            >
              {/* Header */}
              <div className={`flex items-center justify-between px-5 py-4 border-b transition-colors duration-300 ${
                modalMode === 'lexdrive' ? 'border-[#0e5be9]/20' : 'border-rose-400/20'
              }`}>
                <div className="flex items-center gap-2">
                  {modalMode === 'lexdrive'
                    ? <HandshakeIcon className="w-4 h-4 text-[#7bb3f7] shrink-0" />
                    : <BriefcaseIcon className="w-4 h-4 text-rose-300 shrink-0" />
                  }
                  <p className="text-sm font-semibold text-white">
                    {modalMode === 'lexdrive' ? 'LexDrive Komplettservice' : 'Eigene Kanzlei — Bestätigung'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <XIcon className={`w-3.5 h-3.5 ${modalMode === 'lexdrive' ? 'text-[#7bb3f7]' : 'text-rose-200'}`} />
                </button>
              </div>

              <div className="px-5 py-5 space-y-5">
                {/* E-Mail-Eingabe — nur bei eigene Kanzlei */}
                {modalMode === 'eigene_kanzlei' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-rose-200">
                      E-Mail deiner Kanzlei
                    </label>
                    <div className="relative">
                      <MailIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rose-400 pointer-events-none" />
                      <input
                        type="email"
                        value={kanzleiEmail}
                        onChange={(e) => setKanzleiEmail(e.target.value)}
                        placeholder="kanzlei@example.de"
                        className="w-full bg-white/10 border border-rose-400/40 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-rose-300/40 focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/60 transition-colors"
                      />
                    </div>
                    <p className="text-[11px] text-rose-300/70">
                      Wir senden Gutachten und Unterlagen an diese Adresse.
                    </p>
                  </div>
                )}

                {/* Vergleich: Eigene Kanzlei vs LexDrive */}
                <div className="rounded-xl border border-[#0e5be9]/30 bg-[#0e5be9]/[0.08] p-4 space-y-3">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-[#7bb3f7]/80">
                    Auszahlungsvergleich
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Eigene Kanzlei */}
                    <div className={`rounded-lg border px-3 py-2.5 space-y-0.5 transition-opacity duration-300 ${
                      modalMode === 'lexdrive' ? 'opacity-40 bg-white/5 border-white/10' : 'bg-rose-900/40 border-rose-500/30'
                    }`}>
                      <p className="text-[10px] text-rose-300/70 font-medium uppercase tracking-wide">Eigene Kanzlei</p>
                      <p className="text-lg font-bold text-rose-200">
                        {(anzeigeBetrag ?? 0).toLocaleString('de-DE', {
                          style: 'currency',
                          currency: 'EUR',
                          maximumFractionDigits: 0,
                        })}
                      </p>
                      <p className="text-[10px] text-rose-300/60">Ohne Nutzungsausfall &amp; Pauschale</p>
                    </div>
                    {/* LexDrive */}
                    <div className={`rounded-lg border px-3 py-2.5 space-y-0.5 transition-all duration-300 ${
                      modalMode === 'lexdrive'
                        ? 'bg-[#0e5be9]/30 border-[#0e5be9] ring-1 ring-[#0e5be9]/60'
                        : 'bg-[#0e5be9]/15 border-[#0e5be9]/40'
                    }`}>
                      <p className="text-[10px] text-[#7bb3f7]/70 font-medium uppercase tracking-wide">LexDrive</p>
                      <p className="text-lg font-bold text-[#7bb3f7]">
                        {((anspruchVsEur ?? 0) + (nutzungsausfallBetragEur ?? 0) + 25).toLocaleString('de-DE', {
                          style: 'currency',
                          currency: 'EUR',
                          maximumFractionDigits: 0,
                        })}
                      </p>
                      <p className="text-[10px] text-[#7bb3f7]/60">Inkl. Nutzungsausfall + 25 € Pauschale</p>
                    </div>
                  </div>
                  {/* LexDrive-CTA — zeigt Ausgewählt wenn aktiv */}
                  <button
                    type="button"
                    onClick={() => setModalMode('lexdrive')}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-all duration-300 ${
                      modalMode === 'lexdrive'
                        ? 'border-[#0e5be9] bg-[#0e5be9]/25 ring-1 ring-[#0e5be9]/50'
                        : 'border-[#0e5be9]/50 bg-[#0e5be9]/10 hover:bg-[#0e5be9]/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#0e5be9]/30 flex items-center justify-center shrink-0">
                        {modalMode === 'lexdrive'
                          ? <CheckIcon className="w-3.5 h-3.5 text-[#7bb3f7]" />
                          : <HandshakeIcon className="w-3.5 h-3.5 text-[#7bb3f7]" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#7bb3f7]">
                          {modalMode === 'lexdrive' ? 'LexDrive gewählt ✓' : 'Kostenfreier LexDrive-Komplettservice'}
                        </p>
                        <p className="text-[10px] text-[#7bb3f7]/60 mt-0.5">Anwaltliche Betreuung — vollständig kostenlos</p>
                      </div>
                      {modalMode !== 'lexdrive' && <ChevronRightIcon className="w-3.5 h-3.5 text-[#7bb3f7]/60 shrink-0" />}
                    </div>
                  </button>
                </div>

                {/* Bestätigen — Farbe + Funktion je nach Modus */}
                <button
                  type="button"
                  onClick={modalMode === 'lexdrive' ? bestaetigenLexDrive : bestaetigen}
                  disabled={pending || (modalMode === 'eigene_kanzlei' && !kanzleiEmail.trim())}
                  className={`w-full text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 ${
                    modalMode === 'lexdrive'
                      ? 'bg-[#0e5be9] hover:bg-[#0a3fa0] active:bg-[#0a3fa0]'
                      : 'bg-rose-500/70 hover:bg-rose-500/90 active:bg-rose-600/90 backdrop-blur-sm border border-rose-300/40 shadow-inner'
                  }`}
                >
                  {pending
                    ? 'Wird gespeichert…'
                    : modalMode === 'lexdrive'
                      ? 'LexDrive Komplettservice bestätigen'
                      : 'Bestätigen (kein Service)'
                  }
                </button>
                {error && <p className={`text-xs ${modalMode === 'lexdrive' ? 'text-[#7bb3f7]' : 'text-rose-300'}`}>{error}</p>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function LexDriveVollmachtGate({
  fallId,
  onConfirmed,
}: {
  fallId?: string | null
  onConfirmed?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function bestaetigen() {
    if (!fallId) { setError('Fall-ID fehlt'); return }
    setError(null)
    startTransition(async () => {
      const r = await bestaetigeVollmachtKunde(fallId)
      if (!r.ok) { setError(r.error ?? 'Speichern fehlgeschlagen'); return }
      onConfirmed?.()
    })
  }

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
          LexDrive hat dir eine Vollmacht per WhatsApp geschickt.
          Du kannst sie dort bestätigen — oder direkt hier mit einem Klick.
          Sobald die Bestätigung vorliegt, geht deine Akte automatisch an die Kanzlei.
        </p>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={bestaetigen}
            disabled={pending || !fallId}
            className="bg-[#0e5be9] hover:bg-[#0a3fa0] active:bg-[#0a3fa0] text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <CheckIcon className="w-3.5 h-3.5" />
            {pending ? 'Wird bestätigt…' : 'Vollmacht jetzt bestätigen'}
          </button>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#0e5be9] animate-pulse" />
            <span className="text-[11px] font-medium text-[#0e5be9]">Warte auf deine Bestätigung</span>
          </div>
        </div>
        {error && <p className="text-[11px] text-red-700 mt-1.5">{error}</p>}
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
