'use client'

// CMM-32 Polish: LexDrive-Card in der Kunde-Sidebar — sichtbar wenn der
// Kunde LexDrive als Komplettservice gewaehlt hat und die Vollmacht
// bereits signiert ist (kanzlei_wunsch='partnerkanzlei' +
// vollmacht_signiert_am gesetzt). Zeigt einen kleinen QR-Code als
// Kreis-Avatar — Klick oeffnet das Modal mit dem grossen QR.

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScaleIcon, XIcon } from 'lucide-react'

type Props = {
  /** Komplette QR-SVG als String (server-side rendered). */
  qrSvg: string
  /** Was der QR enthaelt — wird im Modal als Link angezeigt. */
  qrUrl: string
  /** Hintergrundfarbe der Card (Sidebar-Akzent). */
  accentBg: string
}

export default function LexDriveCard({ qrSvg, qrUrl, accentBg: _accentBg }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="kunde-sidebar-rest mx-3 my-1 rounded-xl bg-[#0e5be9]/[0.12] hover:bg-[#0e5be9]/[0.20] transition-colors px-3 py-3 text-left flex items-center gap-3 group"
      >
        <div
          className="w-12 h-12 rounded-full bg-white shrink-0 overflow-hidden flex items-center justify-center ring-2 ring-[#0e5be9]/40 group-hover:ring-[#0e5be9]/70 transition-all"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold flex items-center gap-1.5">
            <ScaleIcon className="w-3.5 h-3.5 text-[#7BA3CC] shrink-0" />
            LexDrive
          </p>
          <p className="text-[10px] text-[#7BA3CC] leading-tight mt-0.5">
            QR-Code für Kontakt
          </p>
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
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/60"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="w-full max-w-sm rounded-2xl border border-[#0e5be9]/30 bg-white shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-claimondo-border bg-[#0e5be9]/[0.05]">
                <div className="flex items-center gap-2">
                  <ScaleIcon className="w-4 h-4 text-[#0e5be9] shrink-0" />
                  <p className="text-sm font-semibold text-[#0a3fa0]">LexDrive — Kontakt</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-full bg-claimondo-border hover:bg-claimondo-ondo/30 flex items-center justify-center transition-colors"
                >
                  <XIcon className="w-3.5 h-3.5 text-claimondo-navy" />
                </button>
              </div>
              <div className="px-6 py-6 space-y-4 flex flex-col items-center">
                <div
                  className="w-64 h-64 bg-white rounded-xl border border-claimondo-border p-2"
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
    </>
  )
}
