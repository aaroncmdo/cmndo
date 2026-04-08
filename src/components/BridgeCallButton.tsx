'use client'

import { useState } from 'react'
import { PhoneIcon, XIcon, Loader2Icon } from 'lucide-react'

export default function BridgeCallButton({
  fallId,
  initiator,
  gegenseiteLabel,
  eigeneTelefon,
}: {
  fallId: string
  initiator: 'kunde' | 'sv'
  gegenseiteLabel: string
  eigeneTelefon: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'gestartet' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const telMasked = eigeneTelefon.replace(/(.{3}).+(.{4})$/, '$1 *** $2')

  async function handleCall() {
    setLoading(true)
    setErrorMsg('')
    try {
      const { startBridgeCall } = await import('@/lib/aircall/bridge')
      const result = await startBridgeCall({ initiator, fallId })
      if ('error' in result) {
        setErrorMsg(result.error)
        setStatus('error')
      } else {
        setStatus('gestartet')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Anruf fehlgeschlagen')
      setStatus('error')
    }
    setLoading(false)
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setStatus('idle'); setErrorMsg('') }}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#4573A2] text-white text-sm font-medium rounded-xl hover:bg-[#1E3A5F] transition-colors">
        <PhoneIcon className="w-4 h-4" />
        {initiator === 'kunde' ? 'Mit Gutachter sprechen' : 'Kunde anrufen'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Anruf starten</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><XIcon className="w-5 h-5" /></button>
            </div>

            <div className="px-5 py-5">
              {status === 'gestartet' ? (
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3 animate-pulse">
                    <PhoneIcon className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">Wir rufen dich gleich an!</p>
                  <p className="text-xs text-gray-500">Bitte halte dein Telefon bereit. Sobald du abnimmst, verbinden wir dich mit {gegenseiteLabel}.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-700 mb-3">
                    Wir rufen dich auf <strong>{telMasked}</strong> an. Sobald du den Anruf annimmst, verbinden wir dich mit <strong>{gegenseiteLabel}</strong>.
                  </p>
                  <p className="text-xs text-gray-400 mb-1">Falls du nicht abnimmst, wird der Anruf nach 30 Sekunden abgebrochen.</p>

                  {/* DSGVO-Hinweis */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-3 mb-4">
                    <p className="text-[10px] text-gray-500">
                      Gespräche werden zur Qualitätssicherung aufgezeichnet und transkribiert. Mit dem Klick auf "Jetzt anrufen" stimmst du zu.
                    </p>
                  </div>

                  {status === 'error' && errorMsg && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                      <p className="text-xs text-red-600">{errorMsg}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {status !== 'gestartet' && (
              <div className="px-5 py-4 border-t border-gray-200 flex gap-2">
                <button onClick={() => setOpen(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                  Abbrechen
                </button>
                <button onClick={handleCall} disabled={loading}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-[#4573A2] rounded-lg hover:bg-[#1E3A5F] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <PhoneIcon className="w-4 h-4" />}
                  Jetzt anrufen
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
