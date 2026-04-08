'use client'

import { useState } from 'react'
import { PhoneIcon, XIcon, Loader2Icon } from 'lucide-react'
import { getCallBriefing, startCall } from '@/lib/actions/call-actions'

export default function ClickToCall({ telefon, fallId, leadId, kundeName }: {
  telefon: string
  fallId?: string
  leadId?: string
  kundeName?: string
}) {
  const [open, setOpen] = useState(false)
  const [briefing, setBriefing] = useState<string | null>(null)
  const [loadingBriefing, setLoadingBriefing] = useState(false)
  const [calling, setCalling] = useState(false)
  const [callStarted, setCallStarted] = useState(false)

  async function handleOpen() {
    setOpen(true)
    setLoadingBriefing(true)
    setBriefing(null)
    try {
      const b = await getCallBriefing({ fallId, leadId })
      setBriefing(b)
    } catch { setBriefing('Briefing konnte nicht geladen werden.') }
    setLoadingBriefing(false)
  }

  async function handleCall() {
    setCalling(true)
    try {
      await startCall({ fallId, leadId, telefon })
      setCallStarted(true)
    } catch { /* */ }
    setCalling(false)
  }

  if (!telefon) return null

  return (
    <>
      <button onClick={handleOpen}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4573A2] text-white text-xs font-medium rounded-lg hover:bg-[#1E3A5F] transition-colors">
        <PhoneIcon className="w-3.5 h-3.5" /> Anrufen
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Anruf: {kundeName ?? telefon}</h3>
                <p className="text-xs text-gray-500">{telefon}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><XIcon className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {callStarted ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                    <PhoneIcon className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-900">Anruf wird aufgebaut...</p>
                  <p className="text-xs text-gray-500 mt-1">Aircall verbindet Sie mit {kundeName ?? telefon}.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Pre-Call Briefing</p>
                  {loadingBriefing ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                      <Loader2Icon className="w-4 h-4 animate-spin" /> Briefing wird generiert...
                    </div>
                  ) : briefing ? (
                    <div className="bg-[#0D1B3E]/5 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {briefing}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {!callStarted && (
              <div className="px-5 py-4 border-t border-gray-200 flex gap-2">
                <button onClick={() => setOpen(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                  Abbrechen
                </button>
                <button onClick={handleCall} disabled={calling}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-[#4573A2] rounded-lg hover:bg-[#1E3A5F] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  <PhoneIcon className="w-4 h-4" />
                  {calling ? 'Wird verbunden...' : 'Jetzt anrufen'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
