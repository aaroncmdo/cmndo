'use client'

// Popover-Modal zur Anzeige eines Legal-Dokuments (AGB, Datenschutz,
// Impressum, Nutzungsbedingungen). Wird in den FlowLink- und Onboarding-
// Checkboxes statt eines target=_blank-Links verwendet — der Kunde
// verlaesst den Flow nicht mehr.
//
// Props:
//   - titel + markdown vom Server reingereicht (Server kann fs lesen,
//     Client nicht direkt aus src/content/*)
//   - children = Trigger-Label (z.B. "Datenschutzerklärung")
//   - variant = link (inline-link-Styling) | button
//
// Markdown-Renderer ist react-markdown (bereits eingebunden, AAR-446).

import { useState } from 'react'
import { XIcon } from 'lucide-react'
import LegalDocBody from './LegalDocBody'

type Props = {
  titel: string
  markdown: string
  children: React.ReactNode
  /** Visuelle Variante des Triggers. Default: link (inline) */
  variant?: 'link' | 'button'
  className?: string
}

export default function LegalDocPopover({ titel, markdown, children, variant = 'link', className }: Props) {
  const [open, setOpen] = useState(false)

  const triggerCls = variant === 'button'
    ? `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-claimondo-border bg-white hover:bg-claimondo-bg text-claimondo-navy transition-colors ${className ?? ''}`
    : `text-claimondo-ondo underline hover:text-claimondo-shield ${className ?? ''}`

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen(true) }}
        className={triggerCls}
      >
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[1px] sm:p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={titel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white shadow-2xl w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[90dvh] sm:max-h-[85vh] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-claimondo-border flex-shrink-0">
              <h3 className="text-sm font-semibold text-claimondo-navy">{titel}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-claimondo-bg text-claimondo-ondo/70 hover:text-claimondo-ondo"
                aria-label="Schließen"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-claimondo-navy">
              <LegalDocBody markdown={markdown} />
            </div>

            <div className="px-5 py-3 border-t border-claimondo-border bg-claimondo-bg flex-shrink-0">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full px-4 py-2.5 rounded-lg bg-claimondo-navy hover:bg-claimondo-shield text-white text-sm font-medium transition-colors"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
