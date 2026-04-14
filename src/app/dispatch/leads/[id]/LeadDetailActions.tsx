'use client'

import { useState, useTransition } from 'react'
import { setLeadPhase, disqualifiziereLead, setServiceTyp } from './actions'
import { sendFlowLink } from '@/app/admin/dispatch/actions'
import { LinkIcon, XCircleIcon, CheckCircleIcon } from 'lucide-react'

export default function LeadDetailActions({
  leadId,
  currentPhase,
  serviceTyp,
  flowStatus,
  hardGateOk = false,
  hasSvTermin = false,
}: {
  leadId: string
  currentPhase: string
  serviceTyp: string
  flowStatus: 'none' | 'offen' | 'abgeschlossen' | 'abgelaufen'
  hardGateOk?: boolean
  // AAR-115: FlowLink nur freischalten wenn auch SV + Termin reserviert sind
  hasSvTermin?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [showDQ, setShowDQ] = useState(false)
  const [dqGrund, setDqGrund] = useState('')
  const [toast, setToast] = useState('')

  const isTerminal = ['konvertiert', 'disqualifiziert', 'kalt'].includes(currentPhase)

  function handleAction(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn()
        setToast('Gespeichert')
        setTimeout(() => setToast(''), 2000)
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Fehler')
        setTimeout(() => setToast(''), 3000)
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div className={`text-xs font-medium px-3 py-2 rounded-lg ${toast === 'Gespeichert' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {toast}
        </div>
      )}

      {/* Qualifizieren */}
      {!isTerminal && currentPhase !== 'in-qualifizierung' && (
        <button
          disabled={pending}
          onClick={() => handleAction(() => setLeadPhase(leadId, 'in-qualifizierung'))}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#4573A2] text-white text-sm font-medium hover:bg-[#3a6290] transition-colors disabled:opacity-50"
        >
          <CheckCircleIcon className="w-4 h-4" />
          Qualifizieren
        </button>
      )}

      {/* FlowLink generieren — AAR-80 Hard Gate + AAR-115 SV-Termin Block */}
      {!isTerminal && flowStatus !== 'abgeschlossen' && (
        <>
          <button
            disabled={pending || !hardGateOk || !hasSvTermin}
            onClick={() => handleAction(async () => { await sendFlowLink(leadId) })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={!hardGateOk ? 'Schritt 0 Hard Gate muss erst abgeschlossen sein' : !hasSvTermin ? 'SV + Termin muss erst reserviert sein' : ''}
          >
            <LinkIcon className="w-4 h-4" />
            FlowLink generieren
          </button>
          {!hardGateOk && (
            <p className="text-[10px] text-amber-700 text-center">Schritt 0 Hard Gate erst abschließen</p>
          )}
          {hardGateOk && !hasSvTermin && (
            <p className="text-[10px] text-amber-700 text-center">SV + Termin erst reservieren</p>
          )}
        </>
      )}

      {/* Rückruf: entfernt (AAR-118) — siehe RueckrufSection.tsx (AAR-98) */}

      {/* Disqualifizieren */}
      {!isTerminal && (
        <>
          <button
            onClick={() => setShowDQ(!showDQ)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
          >
            <XCircleIcon className="w-4 h-4" />
            Disqualifizieren
          </button>
          {showDQ && (
            <div className="bg-red-50 rounded-lg p-3 space-y-2">
              <input
                type="text"
                placeholder="Grund..."
                value={dqGrund}
                onChange={(e) => setDqGrund(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-red-200 text-sm"
              />
              <button
                disabled={pending || !dqGrund}
                onClick={() => handleAction(async () => {
                  await disqualifiziereLead(leadId, dqGrund)
                  setShowDQ(false)
                  setDqGrund('')
                })}
                className="w-full px-3 py-1.5 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Endgültig DQ
              </button>
            </div>
          )}
        </>
      )}

      {/* Service-Typ Toggle */}
      {!isTerminal && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase">Service-Typ</h3>
          <div className="flex gap-2">
            {(['komplett', 'nur_gutachter'] as const).map((typ) => (
              <button
                key={typ}
                disabled={pending}
                onClick={() => handleAction(() => setServiceTyp(leadId, typ))}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  serviceTyp === typ
                    ? 'bg-[#0D1B3E] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {typ === 'komplett' ? 'Komplett' : 'Nur SV'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Terminal state info */}
      {isTerminal && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-sm text-gray-500">
            Lead ist <span className="font-medium">{currentPhase}</span> — keine Aktionen verfügbar.
          </p>
        </div>
      )}
    </div>
  )
}
