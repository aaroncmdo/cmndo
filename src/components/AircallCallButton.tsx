'use client'

// AAR-97: Click-to-Call Button via Aircall API
import { useState } from 'react'
import { PhoneIcon } from 'lucide-react'

export default function AircallCallButton({
  phoneNumber, leadId, fallId, variant = 'icon',
}: {
  phoneNumber: string | null
  leadId?: string
  fallId?: string
  variant?: 'icon' | 'button'
}) {
  const [calling, setCalling] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleCall() {
    if (!phoneNumber) return
    setCalling(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/aircall/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, leadId, fallId }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error ?? `Fehler ${res.status}` })
      } else {
        setFeedback({ ok: true, msg: 'Anruf gestartet - bitte Aircall-App pruefen' })
      }
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : String(err) })
    } finally {
      setCalling(false)
      setTimeout(() => setFeedback(null), 4000)
    }
  }

  if (!phoneNumber) return null

  if (variant === 'icon') {
    return (
      <div className="relative inline-flex items-center">
        <button
          onClick={handleCall}
          disabled={calling}
          title={`${phoneNumber} via Aircall anrufen`}
          className="text-[#4573A2] hover:text-[#0D1B3E] disabled:opacity-50 transition-colors"
        >
          <PhoneIcon className="w-4 h-4" />
        </button>
        {feedback && (
          <span className={`ml-2 text-xs ${feedback.ok ? 'text-emerald-600' : 'text-red-500'}`}>{feedback.msg}</span>
        )}
      </div>
    )
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        onClick={handleCall}
        disabled={calling}
        className="flex items-center gap-2 px-3 py-1.5 bg-[#4573A2] text-white text-sm rounded-lg hover:bg-[#0D1B3E] disabled:opacity-50 transition-colors"
      >
        <PhoneIcon className="w-4 h-4" />
        {calling ? 'Anruf laeuft...' : `${phoneNumber} anrufen`}
      </button>
      {feedback && (
        <span className={`text-xs ${feedback.ok ? 'text-emerald-600' : 'text-red-500'}`}>{feedback.msg}</span>
      )}
    </div>
  )
}
