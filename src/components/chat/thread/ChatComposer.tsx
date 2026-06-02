'use client'

// Chat-Inbox P2: geteilter Composer (Textfeld + Senden + Enter-to-send + extras-Slot).
// extras rendert ueber dem Eingabefeld (Quick-Replies / Fall-Bezug-Picker).

import { useState, type ReactNode } from 'react'
import { SendIcon } from 'lucide-react'
import { Button } from '@/components/primitives'

export function ChatComposer({
  onSend,
  sending = false,
  placeholder = 'Nachricht…',
  extras,
  disabled = false,
}: {
  onSend: (text: string) => void | Promise<void>
  sending?: boolean
  placeholder?: string
  extras?: ReactNode
  disabled?: boolean
}) {
  const [value, setValue] = useState('')

  const submit = () => {
    const text = value.trim()
    if (!text || sending || disabled) return
    setValue('')
    void onSend(text)
  }

  return (
    <div className="border-t border-claimondo-border p-3">
      {extras}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          className="flex-1 px-4 py-2.5 bg-claimondo-bg border border-claimondo-border rounded-ios-xl text-sm focus:outline-none focus:border-claimondo-ondo"
          disabled={sending || disabled}
        />
        <Button onClick={submit} disabled={!value.trim() || sending || disabled} loading={sending} aria-label="Senden">
          <SendIcon className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
