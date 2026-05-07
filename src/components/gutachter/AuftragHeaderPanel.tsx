'use client'

// CMM-32 Walkthrough: SV-Header-Banner — kombiniert Stepper, Termin-Daten,
// Navigation, SV-Briefing und „vor Ort einzusammeln"-Liste in einem
// blau-transparenten Banner. Visuelle Anker-Karte für die ganze Phase
// „Termin → Besichtigung". „Bin angekommen" bleibt bewusst eine eigene
// Card daneben (Aaron-Spec: entkoppeln vom Briefing-Banner, weil man
// nicht jedes Mal scrollen will um den Vor-Ort-Trigger zu sehen).

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckIcon,
  CalendarIcon,
  MapPinIcon,
  FileTextIcon,
  NavigationIcon,
  ClockIcon,
  XCircleIcon,
  AlertTriangleIcon,
  SparklesIcon,
  ClipboardListIcon,
} from 'lucide-react'
import { Modal } from '@/components/primitives/Modal'
import {
  AUFTRAGS_PHASE_INDEX,
  AUFTRAGS_PHASE_LABEL,
  FALL_PHASE_LABEL,
  isFallPhase,
  type AuftragsPhase,
  type SvLifecyclePhase,
} from '@/lib/auftrag/phase'
import {
  terminAblehnen,
  terminGegenvorschlag,
} from '@/lib/actions/termin-actions'
import { meldeNoShow } from '@/lib/actions/storno-actions'
import {
  terminVerlegungBestaetigen,
  terminVerlegungAblehnen,
} from '@/lib/actions/termin-verlegung-actions'
import TerminVerlegenModal from './TerminVerlegenModal'
import type { PflichtSlotForView } from '@/components/fall/PflichtdokumenteSection'

const PHASES: { key: AuftragsPhase; icon: typeof CalendarIcon }[] = [
  { key: 'termin', icon: CalendarIcon },
  { key: 'besichtigung', icon: MapPinIcon },
  { key: 'gutachten', icon: FileTextIcon },
]

export type AuftragTerminInfo = {
  id: string
  status: string
  start_zeit: string | null
  vorgeschlagenes_datum: string | null
  gegenvorschlag_von: string | null
  /** AAR-864: TRUE wenn Kunde die Verlegung initiiert hat — SV bestätigt. */
  verlegung_initiator_kunde?: boolean | null
  /** CMM-32 Polish: Server-Side berechneter Verstrichen-Flag.
   *  Triggert den roten "Termin verstrichen — bitte rückmelden"-Banner. */
  verstrichen?: boolean
}

type Props = {
  phase: SvLifecyclePhase
  /** Gutachten ist hochgeladen, QC läuft → Phase „gutachten" wird lila. */
  gutachtenInQc?: boolean
  termin: AuftragTerminInfo | null
  /** Adresse für Navigation + Anzeige. */
  adresse: string | null
  fallId: string
  /** SV-Briefing aus claims.sv_briefing_text (CMM-32-Walkthrough). */
  briefingText: string | null
  /** Pflicht-Slots für „vor Ort einzusammeln". */
  pflichtSlots: PflichtSlotForView[]
}

function fmtTermin(iso: string | null): { datum: string; uhrzeit: string } | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return {
      datum: d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      uhrzeit: d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
    }
  } catch {
    return null
  }
}

export default function AuftragHeaderPanel({
  phase,
  gutachtenInQc = false,
  termin,
  adresse,
  fallId,
  briefingText,
  pflichtSlots,
}: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<'ablehnen' | 'gegenvorschlag' | 'verlegen' | 'noshow' | null>(null)
  const [grund, setGrund] = useState('')
  const [neuerTermin, setNeuerTermin] = useState('')
  const [loading, setLoading] = useState(false)

  const fallPhase = isFallPhase(phase) ? phase : null
  const auftragsPhaseKey: AuftragsPhase = fallPhase ? 'abgeschlossen' : (phase as AuftragsPhase)
  const aktuellIdx = AUFTRAGS_PHASE_INDEX[auftragsPhaseKey]
  const abgeschlossen = auftragsPhaseKey === 'abgeschlossen'

  const istReserviert = termin?.status === 'reserviert'
  const istBestaetigt = termin?.status === 'bestaetigt'
  // CMM-32 Polish: Verstrichen-Flag kommt server-side aus page.tsx mit
  // strikten Guards (Stunden + Tolernz, durchgefuehrt_am NULL,
  // sv_angekommen_am NULL, sv_unterwegs_seit NULL, status='bestaetigt').
  // Damit kann der SV den Banner nicht durch lokales Datum/Uhrzeit-
  // Drift fehlinterpretieren.
  const istVerstrichen = !!termin?.verstrichen && phase === 'termin'
  const istEigenerGegenvorschlag =
    termin?.status === 'gegenvorschlag' && termin.gegenvorschlag_von === 'sv'
  // AAR-864: Verlegung-Pending-State — Hinweis nur sichtbar solange wir noch
  // in der Termin-Phase sind UND der Slot in der Zukunft liegt.
  const pendingInZukunft = termin?.start_zeit
    ? new Date(termin.start_zeit).getTime() > Date.now()
    : false
  const istVerlegungPending =
    termin?.status === 'verlegung_pending' && phase === 'termin' && pendingInZukunft
  // Wer hat die Verlegung initiiert?
  const istKundeInitiator = !!termin?.verlegung_initiator_kunde
  // SV muss bestätigen wenn Kunde initiiert hat
  const svDarfBestaetigen = istVerlegungPending && istKundeInitiator

  const fmt = fmtTermin(termin?.start_zeit ?? null)
  const fmtVorgeschlag = fmtTermin(termin?.vorgeschlagenes_datum ?? null)

  const offenePflicht = pflichtSlots.filter((s) => s.pflicht && s.status !== 'erfuellt')
  const hatBriefing = !!briefingText && briefingText.trim().length > 0

  async function handleAblehnen() {
    setLoading(true)
    // AAR-864: Bei pending-Verlegung lehnen wir die Verlegung ab (alter
    // Termin bleibt bestehen) statt den Termin zu stornieren.
    if (istVerlegungPending && termin?.id) {
      const r = await terminVerlegungAblehnen({ neuerTerminId: termin.id, grund })
      setLoading(false)
      if (r.ok) {
        setModal(null)
        router.refresh()
      }
      return
    }
    const result = await terminAblehnen({ grund, source: 'sv_portal', fallId })
    setLoading(false)
    if (result.success) {
      setModal(null)
      router.refresh()
    }
  }

  async function handleVerlegungBestaetigen() {
    if (!termin?.id) return
    setLoading(true)
    try {
      const r = await terminVerlegungBestaetigen({ neuerTerminId: termin.id })
      if (!r.ok) {
        // eslint-disable-next-line no-alert
        alert(`Fehler: ${r.error}`)
        return
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleNoShow() {
    setLoading(true)
    const res = await meldeNoShow(fallId)
    setLoading(false)
    if (res.success) {
      setModal(null)
      router.refresh()
    } else {
      // eslint-disable-next-line no-alert
      alert(`Fehler: ${res.error ?? 'unbekannt'}`)
    }
  }

  async function handleGegenvorschlag() {
    if (!neuerTermin) return
    setLoading(true)
    const result = await terminGegenvorschlag({
      neuesDatum: neuerTermin,
      grund,
      source: 'sv_portal',
      fallId,
    })
    setLoading(false)
    if (result.success) {
      setModal(null)
      router.refresh()
    }
  }

  return (
    <div
      className={
        istVerstrichen
          ? 'rounded-2xl bg-rose-50 border-2 border-rose-400 overflow-hidden'
          : istVerlegungPending
            ? 'rounded-2xl bg-amber-50 border-2 border-amber-400 overflow-hidden'
            : 'rounded-2xl bg-claimondo-navy/[0.06] border border-claimondo-navy/15 backdrop-blur-sm overflow-hidden'
      }
    >
      {/* Sektion 1 — Stepper (weiß, Aaron lässt Platz für künftige Inhalte) */}
      <div className="bg-white px-6 py-4">
        <div className="flex items-center w-full">
          {PHASES.map((p, i) => {
            const isCurrent = !abgeschlossen && i === aktuellIdx
            const isDone = abgeschlossen || i < aktuellIdx
            const istQc = isCurrent && p.key === 'gutachten' && gutachtenInQc
            // AAR-864: bei Verlegung-Pending → Termin-Phase amber + Warndreieck
            const istVerlegungWarn = istVerlegungPending && p.key === 'termin'
            // CMM-32 Polish: Verstrichener Termin → Termin-Phase rose
            const istVerstrichenWarn = istVerstrichen && p.key === 'termin'
            const Icon = istVerlegungWarn || istVerstrichenWarn ? AlertTriangleIcon : p.icon
            return (
              <React.Fragment key={p.key}>
                <div className="flex items-center gap-3 shrink-0">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      istVerstrichenWarn
                        ? 'bg-rose-500 text-white ring-2 ring-rose-300'
                        : istVerlegungWarn
                          ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                          : isDone
                            ? 'bg-emerald-500 text-white'
                            : istQc
                              ? 'bg-violet-600 text-white ring-2 ring-violet-300'
                              : isCurrent
                                ? 'bg-claimondo-navy text-white ring-2 ring-claimondo-navy/20'
                                : 'bg-white/60 text-claimondo-ondo/60 border border-claimondo-border'
                    }`}
                  >
                    {istVerstrichenWarn || istVerlegungWarn || !isDone ? <Icon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
                  </div>
                  <p
                    className={`text-sm font-semibold whitespace-nowrap ${
                      istVerstrichenWarn
                        ? 'text-rose-700'
                        : istVerlegungWarn
                          ? 'text-amber-700'
                          : istQc
                            ? 'text-violet-700'
                            : isCurrent
                              ? 'text-claimondo-navy'
                              : isDone
                                ? 'text-emerald-700'
                                : 'text-claimondo-ondo/60'
                    }`}
                  >
                    {istQc ? 'Vollständigkeits-Check' : AUFTRAGS_PHASE_LABEL[p.key]}
                  </p>
                </div>
                {i < PHASES.length - 1 && (
                  <div className={`flex-1 h-px mx-4 ${isDone ? 'bg-emerald-300' : 'bg-claimondo-navy/15'}`} />
                )}
              </React.Fragment>
            )
          })}
          {fallPhase && (
            <span className="ml-auto pl-4 text-xs uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 whitespace-nowrap">
              {FALL_PHASE_LABEL[fallPhase]}
            </span>
          )}
        </div>
      </div>

      {/* AAR-864: Während aktiver Besichtigung im Header NUR „Besichtigung läuft" —
          alle anderen Sektionen (Termin-Navi, Briefing, Pflichtliste, Verlegungs-
          Hinweis) werden ausgeblendet, weil sie in dem Moment irrelevant sind. */}
      {phase === 'besichtigung' && (
        <div className="border-t border-claimondo-navy/10 px-6 py-3.5 bg-emerald-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0">
              <MapPinIcon className="w-4 h-4 text-emerald-700" />
            </div>
            <p className="text-sm font-semibold text-emerald-900">
              Besichtigung läuft
            </p>
          </div>
        </div>
      )}

      {/* AAR-864: Verlegungs-Pending-Hinweis (read-only) — direkt unter dem
          Stepper. Sichtbar wenn der SV einen Verlegungs-Vorschlag gemacht
          hat und auf Antwort des Kunden wartet. Termin-Daten werden read-
          only angezeigt — kein Navigation/Termin-Block daneben, weil der
          Termin noch nicht final bestätigt ist. */}
      {termin && istVerlegungPending && (
        <div className="border-t-2 border-amber-400 bg-amber-50 px-6 py-3.5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
              <ClockIcon className="w-4 h-4 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {istKundeInitiator
                  ? 'Kunde möchte verlegen — bitte bestätigen'
                  : 'Verlegung beantragt — Bestätigung ausstehend'}
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                {istKundeInitiator
                  ? 'Der Kunde hat einen neuen Termin vorgeschlagen. Bestätige oder lehne ab — solange wartet der Original-Termin.'
                  : 'Der Kunde wurde benachrichtigt. Bei Nicht-Reaktion eskalieren wir 48h vor dem Original-Termin automatisch an den Kundenbetreuer.'}
              </p>
            </div>
          </div>
          {/* Termin-Daten — read-only bei SV-Initiator, mit Buttons bei Kunde-Initiator */}
          {fmt && (
            <div className="rounded-xl bg-white border-2 border-amber-300 p-3 ml-11">
              <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-1">
                Vorgeschlagener neuer Termin
              </p>
              <p className="text-sm font-semibold text-claimondo-navy">
                {fmt.datum}, {fmt.uhrzeit} Uhr
              </p>
              {adresse && (
                <p className="text-xs text-claimondo-ondo mt-0.5">{adresse}</p>
              )}
              {svDarfBestaetigen && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setModal('ablehnen')}
                    disabled={loading}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <XCircleIcon className="w-4 h-4" />
                    Ablehnen
                  </button>
                  <button
                    onClick={handleVerlegungBestaetigen}
                    disabled={loading}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-white bg-claimondo-navy hover:bg-claimondo-navy/90 transition-colors disabled:opacity-50"
                  >
                    <CheckIcon className="w-4 h-4" />
                    {loading ? 'Wird bestätigt…' : 'Verlegung bestätigen'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CMM-32 Polish: Verstrichen-Banner — Termin liegt > 60min in der
          Vergangenheit ohne sv_angekommen_am / durchgefuehrt_am. Server-
          side Flag mit strikten Guards (siehe page.tsx). Banner ersetzt
          Sektion 2 (Navi/Verlegen) — der SV soll erstmal Rückmeldung
          geben statt navigieren. */}
      {istVerstrichen && termin && (
        <div className="border-t-2 border-rose-400 bg-rose-50 px-6 py-3.5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-rose-100 border border-rose-300 flex items-center justify-center shrink-0">
              <AlertTriangleIcon className="w-4 h-4 text-rose-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-rose-900">
                Termin verstrichen — bitte rückmelden
              </p>
              <p className="text-xs text-rose-800 mt-0.5">
                {fmt
                  ? `Geplant war ${fmt.datum}, ${fmt.uhrzeit} Uhr. `
                  : ''}
                Ohne Rückmeldung wird der Fall nach 5 Werktagen automatisch
                storniert. Bitte angeben was passiert ist.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 ml-11">
            <button
              onClick={() => setModal('noshow')}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              <XCircleIcon className="w-3.5 h-3.5" />
              Kunde war nicht da
            </button>
            <button
              onClick={() => setModal('verlegen')}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white text-rose-800 hover:bg-rose-100 text-sm font-medium px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              <ClockIcon className="w-3.5 h-3.5" />
              Neuen Termin vorschlagen
            </button>
          </div>
        </div>
      )}

      {/* Sektion 2 — Termin + Navi (während Besichtigung + Verstrichen ausblenden) */}
      {phase !== 'besichtigung' && !istVerstrichen && termin && !abgeschlossen && (istBestaetigt || istReserviert || istEigenerGegenvorschlag) && (
        <div className="border-t border-claimondo-navy/10 px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <CalendarIcon className="w-4 h-4 shrink-0 text-claimondo-navy" />
              <div className="min-w-0">
                {istEigenerGegenvorschlag && fmtVorgeschlag ? (
                  <>
                    <p className="text-sm font-semibold text-violet-900">
                      Gegenvorschlag gesendet — {fmtVorgeschlag.datum}
                    </p>
                    <p className="text-xs text-violet-700">
                      {fmtVorgeschlag.uhrzeit} Uhr · wartet auf Dispatcher-Entscheidung
                    </p>
                  </>
                ) : fmt ? (
                  <>
                    <p className="text-sm font-semibold text-claimondo-navy">
                      {fmt.datum}, {fmt.uhrzeit} Uhr
                    </p>
                    {adresse && <p className="text-xs text-claimondo-ondo truncate">{adresse}</p>}
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {adresse && (istBestaetigt || istReserviert) && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-claimondo-navy hover:bg-claimondo-navy/90 text-white text-sm font-medium px-3 py-1.5 transition-colors"
                >
                  <NavigationIcon className="w-3.5 h-3.5" />
                  Navigation
                </a>
              )}
              {istBestaetigt && (
                <button
                  onClick={() => setModal('verlegen')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-claimondo-border bg-white text-claimondo-navy hover:bg-claimondo-navy/5 text-sm font-medium px-3 py-1.5 transition-colors"
                >
                  <ClockIcon className="w-3.5 h-3.5" />
                  Termin verlegen
                </button>
              )}
              {istReserviert && (
                <>
                  <button
                    onClick={() => setModal('ablehnen')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 text-sm font-medium px-3 py-1.5 transition-colors"
                  >
                    <XCircleIcon className="w-3.5 h-3.5" />
                    Ablehnen
                  </button>
                  <button
                    onClick={() => setModal('gegenvorschlag')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-claimondo-border bg-white text-claimondo-navy hover:bg-claimondo-navy/5 text-sm font-medium px-3 py-1.5 transition-colors"
                  >
                    <ClockIcon className="w-3.5 h-3.5" />
                    Gegenvorschlag
                  </button>
                </>
              )}
            </div>
          </div>

          {istReserviert && (
            <p className="text-[11px] text-claimondo-ondo mt-2">
              Termin geblockt — wartet auf Sicherungsabtretungs-Unterschrift des Kunden.
            </p>
          )}
        </div>
      )}

      {/* Sektion 3 — Briefing + Einzusammeln (während Besichtigung ausblenden) */}
      {phase !== 'besichtigung' && (hatBriefing || offenePflicht.length > 0) && (
        <div className="border-t border-claimondo-navy/10 px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Briefing */}
          {hatBriefing && (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <SparklesIcon className="w-4 h-4 text-claimondo-navy" />
                <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-navy">
                  SV-Briefing
                </p>
              </div>
              <p className="text-sm leading-relaxed text-claimondo-navy whitespace-pre-wrap">
                {briefingText}
              </p>
            </div>
          )}

          {/* Vor Ort einzusammeln — gelb eingefasst zur Hervorhebung */}
          {offenePflicht.length > 0 && (
            <div className="flex flex-col rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardListIcon className="w-4 h-4 text-amber-700" />
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-900">
                  Vor Ort einzusammeln
                </p>
              </div>
              <ul className="space-y-1.5">
                {offenePflicht.map((slot) => (
                  <li key={slot.slot_id} className="text-sm text-claimondo-navy">
                    <span className="font-medium">{slot.label}</span>
                    {slot.beschreibung && (
                      <span className="text-xs text-amber-900">
                        {' — '}
                        {slot.beschreibung}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <Modal open={modal === 'ablehnen'} onClose={() => setModal(null)} maxWidth={384} ariaLabel="Termin ablehnen">
        <h3 className="text-lg font-semibold text-claimondo-navy mb-2">Termin ablehnen?</h3>
        <p className="text-sm text-claimondo-ondo mb-4">Claimondo wird einen anderen Gutachter zuweisen.</p>
        <textarea
          value={grund}
          onChange={(e) => setGrund(e.target.value)}
          placeholder="Begründung (optional)"
          className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy mb-4 focus:outline-none focus:border-claimondo-ondo resize-none"
          rows={3}
        />
        <div className="flex gap-2">
          <button
            onClick={() => setModal(null)}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleAblehnen}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Wird abgelehnt…' : 'Ja, ablehnen'}
          </button>
        </div>
      </Modal>

      {/* CMM-32 Polish: No-Show-Bestätigungs-Modal — der SV bestätigt
          dass der Kunde nicht erschienen ist. Inkrementiert no_show_count;
          ab 2x triggert Auto-Storno (KFZ-202). */}
      <Modal open={modal === 'noshow'} onClose={() => setModal(null)} maxWidth={420} ariaLabel="Kunde war nicht da">
        <h3 className="text-lg font-semibold text-claimondo-navy mb-2">Kunde war nicht da?</h3>
        <p className="text-sm text-claimondo-ondo mb-4">
          Wir benachrichtigen den Kunden und legen einen Ersatztermin-Task für Claimondo an.
          Beim zweiten Mal wird der Fall automatisch storniert.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setModal(null)}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleNoShow}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Wird gemeldet…' : 'Ja, war nicht da'}
          </button>
        </div>
      </Modal>

      {/* AAR-864: Verlegen-Modal mit Top-3-Vorschlägen + Routen-Check */}
      <TerminVerlegenModal
        open={modal === 'verlegen'}
        onClose={() => setModal(null)}
        terminId={termin?.id ?? ''}
        fallId={fallId}
      />

      <Modal
        open={modal === 'gegenvorschlag'}
        onClose={() => setModal(null)}
        maxWidth={384}
        ariaLabel="Gegenvorschlag"
      >
        <h3 className="text-lg font-semibold text-claimondo-navy mb-2">Gegenvorschlag</h3>
        <p className="text-sm text-claimondo-ondo mb-4">
          Schlagen Sie einen alternativen Termin vor:
        </p>
        <input
          type="datetime-local"
          value={neuerTermin}
          onChange={(e) => setNeuerTermin(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy mb-3 focus:outline-none focus:border-claimondo-ondo"
        />
        <textarea
          value={grund}
          onChange={(e) => setGrund(e.target.value)}
          placeholder="Begründung (optional)"
          className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy mb-4 focus:outline-none focus:border-claimondo-ondo resize-none"
          rows={2}
        />
        <div className="flex gap-2">
          <button
            onClick={() => setModal(null)}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleGegenvorschlag}
            disabled={loading || !neuerTermin}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-claimondo-navy hover:bg-claimondo-navy/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Wird gesendet…' : 'Senden'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
