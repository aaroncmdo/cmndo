'use client'

// CMM-32 Walkthrough: Kombinierter Header für die SV-Fallakte. Vereint den
// 3-Phasen-Stepper (Termin → Besichtigung → Gutachten) mit der Termin-
// Anzeige als visuell verschmolzener Banner. Termin-Sektion „entspringt"
// dem Stepper — gleicher Container, divider als einziger Trenner.
//
// Gestaltung analog zum KB-QC-Banner: rounded-2xl Wrapper, weißer Stepper
// oben, navy-getönte Termin-Sektion unten mit Datum/Adresse/Aktions-Buttons.

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
}

type Props = {
  phase: SvLifecyclePhase
  /** Gutachten ist hochgeladen, QC läuft → Phase „gutachten" wird lila. */
  gutachtenInQc?: boolean
  termin: AuftragTerminInfo | null
  /** Adresse für Navigation + Anzeige. */
  adresse: string | null
  fallId: string
}

function fmtTermin(iso: string | null): { datum: string; uhrzeit: string } | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return {
      datum: d.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      uhrzeit: d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
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
}: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<'ablehnen' | 'gegenvorschlag' | null>(null)
  const [grund, setGrund] = useState('')
  const [neuerTermin, setNeuerTermin] = useState('')
  const [loading, setLoading] = useState(false)

  const fallPhase = isFallPhase(phase) ? phase : null
  const auftragsPhaseKey: AuftragsPhase = fallPhase ? 'abgeschlossen' : (phase as AuftragsPhase)
  const aktuellIdx = AUFTRAGS_PHASE_INDEX[auftragsPhaseKey]
  const abgeschlossen = auftragsPhaseKey === 'abgeschlossen'

  const istReserviert = termin?.status === 'reserviert'
  const istBestaetigt = termin?.status === 'bestaetigt'
  const istEigenerGegenvorschlag =
    termin?.status === 'gegenvorschlag' && termin.gegenvorschlag_von === 'sv'

  const fmt = fmtTermin(termin?.start_zeit ?? null)
  const fmtVorgeschlag = fmtTermin(termin?.vorgeschlagenes_datum ?? null)

  // Termin-Banner nur während der Auftrags-Phase (Termin/Besichtigung/Gutachten),
  // nicht mehr nach Abschluss.
  const zeigeBanner = termin && !abgeschlossen && (istReserviert || istBestaetigt || istEigenerGegenvorschlag)

  // Banner-Farbschema je Status
  const bannerCls = istReserviert
    ? 'bg-amber-50 border-t border-amber-200'
    : istEigenerGegenvorschlag
      ? 'bg-violet-50 border-t border-violet-200'
      : 'bg-claimondo-navy/[0.04] border-t border-claimondo-border'
  const bannerTextCls = istReserviert
    ? 'text-amber-900'
    : istEigenerGegenvorschlag
      ? 'text-violet-900'
      : 'text-claimondo-navy'
  const bannerSubCls = istReserviert
    ? 'text-amber-800'
    : istEigenerGegenvorschlag
      ? 'text-violet-700'
      : 'text-claimondo-ondo'

  async function handleAblehnen() {
    setLoading(true)
    const result = await terminAblehnen({ grund, source: 'sv_portal', fallId })
    setLoading(false)
    if (result.success) {
      setModal(null)
      router.refresh()
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
    <div className="rounded-2xl border border-claimondo-border bg-white overflow-hidden">
      {/* Stepper-Sektion */}
      <div className="px-6 py-4">
        <div className="flex items-center w-full">
          {PHASES.map((p, i) => {
            const isCurrent = !abgeschlossen && i === aktuellIdx
            const isDone = abgeschlossen || i < aktuellIdx
            const istQc = isCurrent && p.key === 'gutachten' && gutachtenInQc
            const Icon = p.icon
            return (
              <React.Fragment key={p.key}>
                <div className="flex items-center gap-3 shrink-0">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      isDone
                        ? 'bg-emerald-500 text-white'
                        : istQc
                          ? 'bg-violet-600 text-white ring-2 ring-violet-300'
                          : isCurrent
                            ? 'bg-claimondo-navy text-white ring-2 ring-claimondo-navy/20'
                            : 'bg-claimondo-border/40 text-claimondo-ondo/60'
                    }`}
                  >
                    {isDone ? <CheckIcon className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <p
                    className={`text-sm font-semibold whitespace-nowrap ${
                      istQc
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
                  <div className={`flex-1 h-px mx-4 ${isDone ? 'bg-emerald-300' : 'bg-claimondo-border'}`} />
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

      {/* Termin-Banner — visuell verschmolzen mit Stepper */}
      {zeigeBanner && (
        <div className={`${bannerCls} px-6 py-3.5`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <CalendarIcon className={`w-4 h-4 shrink-0 ${bannerTextCls}`} />
              <div className="min-w-0">
                {istEigenerGegenvorschlag && fmtVorgeschlag ? (
                  <>
                    <p className={`text-sm font-semibold ${bannerTextCls}`}>
                      Gegenvorschlag gesendet — {fmtVorgeschlag.datum}
                    </p>
                    <p className={`text-xs ${bannerSubCls}`}>
                      {fmtVorgeschlag.uhrzeit} Uhr · wartet auf Dispatcher-Entscheidung
                    </p>
                  </>
                ) : fmt ? (
                  <>
                    <p className={`text-sm font-semibold ${bannerTextCls}`}>
                      {fmt.datum}, {fmt.uhrzeit} Uhr
                    </p>
                    {adresse && <p className={`text-xs ${bannerSubCls} truncate`}>{adresse}</p>}
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {adresse && istBestaetigt && (
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
              {istReserviert && (
                <>
                  <button
                    onClick={() => setModal('ablehnen')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium px-3 py-1.5 transition-colors"
                  >
                    <XCircleIcon className="w-3.5 h-3.5" />
                    Ablehnen
                  </button>
                  <button
                    onClick={() => setModal('gegenvorschlag')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-claimondo-border text-claimondo-navy hover:bg-white text-sm font-medium px-3 py-1.5 transition-colors"
                  >
                    <ClockIcon className="w-3.5 h-3.5" />
                    Gegenvorschlag
                  </button>
                </>
              )}
            </div>
          </div>

          {istReserviert && (
            <p className={`text-[11px] ${bannerSubCls} mt-2`}>
              Termin geblockt — wartet auf Sicherungsabtretungs-Unterschrift des Kunden.
            </p>
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
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-[#f8f9fb] hover:bg-claimondo-border transition-colors"
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

      <Modal open={modal === 'gegenvorschlag'} onClose={() => setModal(null)} maxWidth={384} ariaLabel="Gegenvorschlag">
        <h3 className="text-lg font-semibold text-claimondo-navy mb-2">Gegenvorschlag</h3>
        <p className="text-sm text-claimondo-ondo mb-4">Schlagen Sie einen alternativen Termin vor:</p>
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
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-[#f8f9fb] hover:bg-claimondo-border transition-colors"
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
