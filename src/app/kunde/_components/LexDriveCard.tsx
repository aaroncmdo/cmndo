'use client'

// CMM-32 Polish: LexDrive-Card in der Kunde-Sidebar — sichtbar wenn der
// Kunde LexDrive als Komplettservice gewaehlt hat und die Vollmacht
// bereits signiert ist. Optisch identisch zur Gutachter-/KB-Card —
// kleiner Avatar-Kreis (mit QR-Preview), Klick oeffnet Modal mit
// grossem QR.

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XIcon } from 'lucide-react'

type Props = {
  qrSvg: string
  qrUrl: string
  /** Sidebar-Akzent-Farbe — derzeit ungenutzt, fuer API-Symmetrie zur GutachterCard. */
  accentBg?: string
}

export default function LexDriveCard({ qrSvg, qrUrl }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-2 mx-3 rounded-ios-xl border bg-white/[0.04] border-white/10 hover:bg-white/10 transition-colors duration-200">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-3 py-2.5 text-left flex flex-col gap-1.5"
        aria-label="LexDrive QR-Code anzeigen"
      >
        <p className="text-[9px] uppercase tracking-wider leading-tight text-claimondo-light-blue">
          Ihre Kanzlei
        </p>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-white shrink-0"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight text-white">
              LexDrive
            </p>
            <p className="text-[10px] leading-tight mt-0.5 text-claimondo-light-blue">
              QR-Code für Kontakt
            </p>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="lexdrive-qr-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/60"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="w-full max-w-sm rounded-2xl border border-claimondo-border bg-white shadow-claimondo-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-claimondo-border">
                <p className="text-sm font-semibold text-claimondo-navy">LexDrive — Kontakt</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-full bg-claimondo-border hover:bg-claimondo-ondo/30 flex items-center justify-center transition-colors"
                  aria-label="Schließen"
                >
                  <XIcon className="w-3.5 h-3.5 text-claimondo-navy" />
                </button>
              </div>
              <div className="px-6 py-6 flex flex-col items-center gap-4">
                <div
                  className="w-64 h-64 bg-white rounded-ios-xl border border-claimondo-border p-2"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <p className="text-xs text-claimondo-ondo text-center leading-relaxed">
                  Scanne den Code mit deinem Handy — er öffnet WhatsApp
                  mit deinem LexDrive-Ansprechpartner.
                </p>
                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-[#0e5be9] hover:underline break-all text-center"
                >
                  {qrUrl}
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
