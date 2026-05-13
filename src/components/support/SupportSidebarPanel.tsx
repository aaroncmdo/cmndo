'use client'

// Hilfe & Support als Inline-Panel innerhalb der Sidebar.
// Ersetzt den Sidebar-Inhalt mit einem Slide-in-Panel (gleiche Breite, kein
// globaler Drawer/Backdrop). Panel ist light-themed (weiß) damit SupportChat
// seine bestehenden Farben behalten kann.

import { useRef } from 'react'
import { ArrowLeftIcon, LightbulbIcon } from 'lucide-react'
import { SupportProvider, useSupport } from './SupportContext'
import { SupportChat } from './SupportChat'

function PanelHeader({
  onClose,
  rolle,
}: {
  onClose: () => void
  rolle?: string | null
}) {
  const { mode, setMode, messages } = useSupport()
  const canDurchdenken =
    !!rolle && ['admin', 'kundenbetreuer', 'dispatch'].includes(rolle)
  const hasStarted = messages.length > 0

  return (
    <div className="px-4 py-3 border-b border-claimondo-border shrink-0 bg-white">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Zurück zur Navigation"
          className="p-1.5 -ml-1 rounded-lg text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg transition-colors shrink-0"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-claimondo-navy leading-tight">
            Hilfe &amp; Support
          </h2>
          <p className="text-[11px] text-claimondo-ondo leading-tight truncate">
            {mode === 'durchdenken'
              ? 'Feature durchdenken'
              : 'KI-Assistenz · legt Linear-Tickets an'}
          </p>
        </div>
      </div>

      {canDurchdenken && !hasStarted && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() =>
              setMode(mode === 'durchdenken' ? 'normal' : 'durchdenken')
            }
            className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
              mode === 'durchdenken'
                ? 'bg-claimondo-ondo/[0.06] text-claimondo-navy border-claimondo-ondo/30'
                : 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border hover:bg-claimondo-ondo/[0.06] hover:text-claimondo-navy hover:border-claimondo-ondo/30'
            }`}
            aria-pressed={mode === 'durchdenken'}
          >
            <LightbulbIcon className="w-3 h-3" />
            Feature durchdenken
          </button>
        </div>
      )}
    </div>
  )
}

export function SupportSidebarPanel({
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
  const panelRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={panelRef}
      aria-hidden={!open}
      className={`absolute inset-0 z-20 flex flex-col bg-white transition-transform duration-200 ease-in-out ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{ pointerEvents: open ? 'auto' : 'none' }}
    >
      <SupportProvider>
        <PanelHeader onClose={onClose} rolle={rolle} />
        <SupportChat userName={userName} />
      </SupportProvider>
    </div>
  )
}
