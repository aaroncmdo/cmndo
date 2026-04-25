'use client'

// AAR-757 (VollClient-Auflösung): aus `FallakteVollClient.tsx` extrahiert.
// Zeigt Termin-Aktionen (Ablehnen, Gegenvorschlag, Annehmen) für
// reservierte oder gegenvorschlag-Termine. Banner zeigt Kunden-
// Gegenvorschlag explizit; reserviert-Status gibt Eingreif-Buttons.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClockIcon, XCircleIcon } from 'lucide-react'
import { Modal } from '@/components/primitives/Modal'
import {
  terminAblehnen,
  terminGegenvorschlag,
  terminAnnehmen,
} from '@/lib/actions/termin-actions'

export type TerminActionsPanelInfo = {
  id: string
  status: string
  start_zeit: string
  end_zeit: string
  vorgeschlagenes_datum: string | null
  gegenvorschlag_von: string | null
  gegenvorschlag_grund: string | null
}

export function TerminActionsPanel({
  fallId,
  termin,
}: {
  fallId: string
  termin: TerminActionsPanelInfo
}) {
  const router = useRouter()
  const [modal, setModal] = useState<'ablehnen' | 'gegenvorschlag' | null>(null)
  const [grund, setGrund] = useState('')
  const [neuerTermin, setNeuerTermin] = useState('')
  const [loading, setLoading] = useState(false)

  const isKundenGegenvorschlag =
    termin.status === 'gegenvorschlag' && termin.gegenvorschlag_von === 'kunde'

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

  async function handleAnnehmen() {
    setLoading(true)
    const result = await terminAnnehmen({ source: 'sv_portal', fallId })
    setLoading(false)
    if (result.success) router.refresh()
  }

  return (
    <div className="mb-4 space-y-3">
      {/* Kunden-Gegenvorschlag Banner */}
      {isKundenGegenvorschlag && termin.vorgeschlagenes_datum && (
        <div className="bg-amber-50 border border-amber-200 rounded-ios-md p-4">
          <p className="text-sm font-medium text-amber-800 mb-1">
            Der Kunde hat einen Gegenvorschlag gemacht
          </p>
          <p className="text-sm text-amber-700">
            Neues Datum:{' '}
            {new Date(termin.vorgeschlagenes_datum).toLocaleString('de-DE', {
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          {termin.gegenvorschlag_grund && (
            <p className="text-xs text-amber-600 mt-1">Grund: {termin.gegenvorschlag_grund}</p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAnnehmen}
              disabled={loading}
              className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-claimondo-navy hover:bg-claimondo-ondo transition-colors disabled:opacity-50"
            >
              {loading ? '…' : 'Annehmen'}
            </button>
            <button
              onClick={() => setModal('gegenvorschlag')}
              disabled={loading}
              className="flex-1 py-2 rounded-lg text-sm font-medium text-claimondo-navy bg-white border border-claimondo-navy hover:bg-[#f8f9fb] transition-colors disabled:opacity-50"
            >
              Erneut gegenvorschlagen
            </button>
            <button
              onClick={() => setModal('ablehnen')}
              disabled={loading}
              className="py-2 px-3 rounded-lg text-sm font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Ablehnen
            </button>
          </div>
        </div>
      )}

      {/* Hinweistext + Buttons (nur bei reserviert) */}
      {termin.status === 'reserviert' && (
        <>
          <div className="bg-claimondo-ondo/10 border border-claimondo-ondo/30 rounded-ios-md px-4 py-3">
            <p className="text-xs text-claimondo-navy">
              Termin ist standardmäßig bestätigt. Hier nur eingreifen wenn Sie ablehnen oder
              verschieben möchten.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setModal('ablehnen')}
              className="flex-1 flex items-center justify-center gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 text-sm py-2.5 rounded-lg transition-colors border border-red-200"
            >
              <XCircleIcon className="w-4 h-4" /> Termin ablehnen
            </button>
            <button
              onClick={() => setModal('gegenvorschlag')}
              className="flex-1 flex items-center justify-center gap-2 text-claimondo-navy hover:bg-claimondo-ondo/10 text-sm py-2.5 rounded-lg transition-colors border border-claimondo-ondo"
            >
              <ClockIcon className="w-4 h-4" /> Gegenvorschlag
            </button>
          </div>
        </>
      )}

      {/* Ablehnen Modal */}
      <Modal open={modal === 'ablehnen'} onClose={() => setModal(null)} maxWidth={384} ariaLabel="Termin ablehnen">
        <h3 className="text-lg font-semibold text-claimondo-navy mb-2">Termin ablehnen?</h3>
            <p className="text-sm text-claimondo-ondo mb-4">
              Claimondo wird einen anderen Gutachter zuweisen.
            </p>
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

      {/* Gegenvorschlag Modal */}
      <Modal open={modal === 'gegenvorschlag'} onClose={() => setModal(null)} maxWidth={384} ariaLabel="Gegenvorschlag">
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
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-[#f8f9fb] hover:bg-claimondo-border transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleGegenvorschlag}
                disabled={loading || !neuerTermin}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-claimondo-navy hover:bg-claimondo-ondo transition-colors disabled:opacity-50"
              >
                {loading ? 'Wird gesendet…' : 'Gegenvorschlag senden'}
              </button>
            </div>
      </Modal>
    </div>
  )
}
