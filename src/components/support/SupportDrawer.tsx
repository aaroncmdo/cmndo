'use client'

// AAR-519 (S2): Slide-in-Drawer rechts — 420px Desktop, full-screen Mobile.
// AAR-625: Durchdenken-Toggle für interne Rollen (admin/kundenbetreuer/dispatch).

import { useEffect, useRef } from 'react'
import { XIcon, LightbulbIcon } from 'lucide-react'
import { SupportProvider, useSupport } from './SupportContext'
import { SupportChat } from './SupportChat'
import { Drawer } from '@/components/primitives/Drawer'

const DURCHDENKEN_ROLES = new Set(['admin', 'kundenbetreuer', 'dispatch'])

function DrawerHeader({ onClose, closeBtnRef, rolle }: {
  onClose: () => void
  closeBtnRef: React.RefObject<HTMLButtonElement | null>
  rolle?: string | null
}) {
  const { mode, setMode, messages } = useSupport()
  const canDurchdenken = !!rolle && DURCHDENKEN_ROLES.has(rolle)
  const hasStarted = messages.length > 0

  return (
    <div className="px-4 py-3 border-b border-claimondo-border shrink-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#0D1B3E]">Hilfe &amp; Support</h2>
          <p className="text-[11px] text-claimondo-ondo">
            {mode === 'durchdenken'
              ? 'Feature durchdenken — bis zu 8 Turns, dann Ticket-Vorschlag.'
              : 'KI-Assistenz — legt bei Bedarf Linear-Tickets an.'}
          </p>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="text-claimondo-ondo/70 hover:text-claimondo-navy p-1 rounded-full hover:bg-[#f8f9fb]"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>
      {canDurchdenken && !hasStarted && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode(mode === 'durchdenken' ? 'normal' : 'durchdenken')}
            className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
              mode === 'durchdenken'
                ? 'bg-violet-50 text-violet-700 border-violet-200'
                : 'bg-[#f8f9fb] text-claimondo-ondo border-claimondo-border hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200'
            }`}
            aria-pressed={mode === 'durchdenken'}
          >
            <LightbulbIcon className="w-3 h-3" />
            Feature durchdenken
          </button>
          {mode === 'durchdenken' && (
            <span className="text-[10px] text-violet-600">Brainstorming-Modus aktiv</span>
          )}
        </div>
      )}
    </div>
  )
}

export function SupportDrawer({
  open,
  onClose,
  userName,
  rolle,
}: {
  open: boolean
  onClose: () => void
  userName?: string | null
  rolle?: string | null
}) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
  }, [open])

  return (
    <Drawer open={open} onClose={onClose} width={420} noPadding hideCloseButton ariaLabel="Hilfe und Support">
      <div className="flex flex-col h-full">
        <SupportProvider>
          <DrawerHeader onClose={onClose} closeBtnRef={closeBtnRef} rolle={rolle} />
          <SupportChat userName={userName} />
        </SupportProvider>
      </div>
    </Drawer>
  )
}
