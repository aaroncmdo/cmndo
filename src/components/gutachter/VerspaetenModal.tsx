'use client'

import { useState, useTransition } from 'react'
import { ClockIcon, XIcon, CheckCircleIcon } from 'lucide-react'

// KFZ-181 Trigger 25: SV verspaetet sich — Modal mit 5/10/15/30 Min Buttons.

const OPTIONEN = [5, 10, 15, 30] as const

export default function VerspaetenModal({
  terminId,
  fallId,
  onClose,
  onSend,
}: {
  terminId: string
  fallId: string
  onClose: () => void
  onSend: (terminId: string, minuten: number) => Promise<{ success?: boolean; error?: string }>
}) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSelect(minuten: number) {
    setError(null)
    startTransition(async () => {
      const result = await onSend(terminId, minuten)
      if (result.success) {
        setDone(true)
        setTimeout(onClose, 1500)
      } else {
        setError(result.error ?? 'Fehler')
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ClockIcon className="w-4 h-4 text-amber-500" /> Verspätung melden
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center">
            <CheckCircleIcon className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm text-emerald-700 font-medium">Kunde wurde informiert</p>
          </div>
        ) : (
          <div className="px-5 py-4">
            <p className="text-xs text-gray-500 mb-4">Wie viele Minuten verspätest du dich?</p>
            <div className="grid grid-cols-2 gap-2">
              {OPTIONEN.map(min => (
                <button
                  key={min}
                  onClick={() => handleSelect(min)}
                  disabled={pending}
                  className="py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 hover:bg-[#4573A2]/5 hover:border-[#4573A2] transition-colors disabled:opacity-50"
                >
                  {min} Min
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-red-600 mt-3 text-center">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
