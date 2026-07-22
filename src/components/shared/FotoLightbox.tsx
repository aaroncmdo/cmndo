'use client'

// Fullscreen-Foto-Vorschau (Lightbox). Wiederverwendbar: Zustands-Galerie (SV-Claim/Cockpit)
// + Zustandsdoku-Capture. `bild` gesetzt = offen; Klick auf den Hintergrund / Esc / ✕ schliesst.
// Overlay ist ein <div> (kein Card/Button-Pattern) -> component-set-safe; Farbe branded (navy/90).
import { useEffect } from 'react'

export type FotoLightboxBild = { url: string; label?: string | null }

export function FotoLightbox({
  bild,
  onClose,
}: {
  bild: FotoLightboxBild | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!bild) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bild, onClose])

  if (!bild) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-claimondo-navy/90 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Vorschau schließen"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-ios-lg bg-white/90 text-lg font-semibold text-claimondo-navy"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bild.url}
        alt={bild.label ?? 'Foto'}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-ios-md object-contain"
      />
      {bild.label ? <p className="text-sm font-medium text-white">{bild.label}</p> : null}
    </div>
  )
}
