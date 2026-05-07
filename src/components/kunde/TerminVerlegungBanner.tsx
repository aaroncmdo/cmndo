'use client'

// AAR-864: Banner im Kunde-Portal, wenn der SV eine Verlegung beantragt hat.
// Zeigt alten + neuen Termin, Grund (falls angegeben), bietet Bestätigen
// + Ablehnen (mit Grund-Modal). Ruft die Server-Actions aus
// lib/actions/termin-verlegung-actions.ts.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarClockIcon,
  CheckIcon,
  XIcon,
  Loader2Icon,
} from 'lucide-react'
import { Modal } from '@/components/primitives/Modal'
import {
  terminVerlegungBestaetigen,
  terminVerlegungAblehnen,
} from '@/lib/actions/termin-verlegung-actions'

type Props = {
  /** ID des verlegung_pending-Slots */
  pendingTerminId: string
  /** Datum des alten Termins (formatiert für Anzeige) */
  alterDatum: string
  alterUhrzeit: string
  neuesDatum: string
  neuesUhrzeit: string
  svVorname: string
  grund: string | null
  /** Embedded-Mode: keine eigene rounded/border, nur Inhalt + obere Trennlinie.
   *  Wird genutzt wenn der Banner aus dem PageHeader-Container „entspringt". */
  embedded?: boolean
}

export default function TerminVerlegungBanner({
  pendingTerminId,
  alterDatum,
  alterUhrzeit,
  neuesDatum,
  neuesUhrzeit,
  svVorname,
  grund,
  embedded = false,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'bestaetigen' | 'ablehnen' | null>(null)
  const [modal, setModal] = useState<'ablehnen' | null>(null)
  const [grundAblehnen, setGrundAblehnen] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)

  async function bestaetigen() {
    setBusy('bestaetigen')
    setFehler(null)
    try {
      const r = await terminVerlegungBestaetigen({ neuerTerminId: pendingTerminId })
      if (!r.ok) {
        setFehler(r.error)
        return
      }
      router.refresh()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setBusy(null)
    }
  }

  async function ablehnen() {
    setBusy('ablehnen')
    setFehler(null)
    try {
      const r = await terminVerlegungAblehnen({
        neuerTerminId: pendingTerminId,
        grund: grundAblehnen.trim() || undefined,
      })
      if (!r.ok) {
        setFehler(r.error)
        return
      }
      setModal(null)
      router.refresh()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div
        className={
          embedded
            ? 'border-t-2 border-amber-400 bg-amber-50 p-5'
            : 'rounded-2xl border-2 border-amber-400 bg-amber-50 p-5'
        }
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
            <CalendarClockIcon className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-claimondo-navy mb-1">
              {svVorname || 'Ihr Gutachter'} möchte den Termin verlegen
            </h3>
            <p className="text-sm text-claimondo-ondo">
              Bitte bestätigen Sie die Verlegung oder lehnen Sie ab — solange Sie nicht
              reagieren, bleibt der ursprüngliche Termin gültig.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-white border border-amber-200 p-3">
            <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo font-semibold mb-1">
              Bisheriger Termin
            </p>
            <p className="text-sm font-semibold text-claimondo-navy">{alterDatum}</p>
            <p className="text-sm text-claimondo-ondo">{alterUhrzeit} Uhr</p>
          </div>
          <div className="rounded-xl bg-white border-2 border-claimondo-navy p-3">
            <p className="text-[11px] uppercase tracking-wider text-claimondo-navy font-semibold mb-1">
              Neuer Vorschlag
            </p>
            <p className="text-sm font-semibold text-claimondo-navy">{neuesDatum}</p>
            <p className="text-sm text-claimondo-ondo">{neuesUhrzeit} Uhr</p>
          </div>
        </div>

        {grund && (
          <p className="text-sm text-claimondo-ondo italic mb-4 px-3 py-2 bg-white/60 rounded-lg border border-amber-200">
            „{grund}"
          </p>
        )}

        {fehler && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
            {fehler}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setModal('ablehnen')}
            disabled={busy !== null}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <XIcon className="w-4 h-4" />
            Ablehnen
          </button>
          <button
            onClick={bestaetigen}
            disabled={busy !== null}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-white bg-claimondo-navy hover:bg-claimondo-navy/90 transition-colors disabled:opacity-50"
          >
            {busy === 'bestaetigen' ? (
              <Loader2Icon className="w-4 h-4 animate-spin" />
            ) : (
              <CheckIcon className="w-4 h-4" />
            )}
            Verlegung bestätigen
          </button>
        </div>
      </div>

      <Modal
        open={modal === 'ablehnen'}
        onClose={() => setModal(null)}
        maxWidth={420}
        ariaLabel="Verlegung ablehnen"
      >
        <h3 className="text-lg font-semibold text-claimondo-navy mb-2">
          Verlegung ablehnen
        </h3>
        <p className="text-sm text-claimondo-ondo mb-4">
          Wenn Sie ablehnen, bleibt der ursprüngliche Termin am{' '}
          <span className="font-semibold">{alterDatum}</span> um{' '}
          <span className="font-semibold">{alterUhrzeit} Uhr</span> bestehen.
        </p>
        <textarea
          value={grundAblehnen}
          onChange={(e) => setGrundAblehnen(e.target.value)}
          placeholder="Grund (optional, wird dem Gutachter angezeigt)"
          rows={3}
          className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy mb-4 resize-none focus:outline-none focus:border-claimondo-ondo"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setModal(null)}
            disabled={busy === 'ablehnen'}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border transition-colors disabled:opacity-50"
          >
            Doch nicht
          </button>
          <button
            onClick={ablehnen}
            disabled={busy === 'ablehnen'}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {busy === 'ablehnen' ? 'Wird abgelehnt…' : 'Ja, ablehnen'}
          </button>
        </div>
      </Modal>
    </>
  )
}
