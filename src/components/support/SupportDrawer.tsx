'use client'

// AAR-519 (S2): Slide-in-Drawer rechts — 420px Desktop, full-screen Mobile.
// Focus-Trap: Fokus auf Close-Button beim Öffnen, Esc schließt, Backdrop-Click schließt.

import { useEffect, useRef } from 'react'
import { XIcon } from 'lucide-react'
import { SupportProvider } from './SupportContext'
import { SupportChat } from './SupportChat'

export function SupportDrawer({
  open,
  onClose,
  userName,
}: {
  open: boolean
  onClose: () => void
  userName?: string | null
}) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Hilfe und Support"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className="relative w-full md:w-[420px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[#0D1B3E]">Hilfe &amp; Support</h2>
            <p className="text-[11px] text-gray-500">KI-Assistenz — legt bei Bedarf Linear-Tickets an.</p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <SupportProvider>
          <SupportChat userName={userName} />
        </SupportProvider>
      </div>
    </div>
  )
}
