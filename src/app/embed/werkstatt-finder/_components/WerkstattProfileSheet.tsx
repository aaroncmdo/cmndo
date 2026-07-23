'use client'

// Mobil/iPad (<lg): Werkstatt-Profil als Bottom-Sheet statt engem Map-Popup — Muster wie
// FinderMap.openSvPopup (SV-Embed, AAR-956). Auf <lg ist ein Map-Popup unbrauchbar: Pins liegen
// teils unter dem Wizard-Sheet (unerreichbar) und das Popup ragt horizontal aus dem Screen.
// Self-contained: Drag-to-close + Body-Scroll-Lock gekapselt. Inhalt = geteiltes WerkstattProfileInhalt.
import { useEffect, useRef, useState } from 'react'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { WerkstattProfileInhalt } from '@/components/werkstatt/finder/WerkstattProfileInhalt'
import { toProfil } from './WerkstattProfilePopup'

export function WerkstattProfileSheet({ w, onClose }: { w: WerkstattVorschlag; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)

  // Body-Scroll-Lock, solange der Sheet offen ist (Hintergrund darf nicht scrollen) — wie SV.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="lg:hidden fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Werkstatt-Profil">
      <div
        className="absolute inset-0 backdrop-blur-sm animate-in fade-in"
        style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary, #0D1B3E) 22%, transparent)' }}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        onTouchStart={(e) => {
          // Drag-to-close nur, wenn der Inhalt oben steht — sonst scrollt der Inhalt.
          if ((sheetRef.current?.scrollTop ?? 0) <= 0) dragStartRef.current = e.touches[0].clientY
        }}
        onTouchMove={(e) => {
          if (dragStartRef.current === null) return
          const dy = e.touches[0].clientY - dragStartRef.current
          if (dy > 0) setDragY(dy) // nur nach unten
        }}
        onTouchEnd={() => {
          if (dragY > 90) onClose()
          setDragY(0)
          dragStartRef.current = null
        }}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragStartRef.current !== null ? 'none' : 'transform 0.25s ease-out',
        }}
        className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto overscroll-contain rounded-t-ios-xl border-t border-white/50 bg-white/70 shadow-glass-card backdrop-blur-xl animate-in slide-in-from-bottom duration-300"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Profil schließen"
          className="sticky top-0 z-10 flex w-full justify-center pt-2.5 pb-2"
        >
          <span className="block h-1 w-10 rounded-full bg-claimondo-navy/25" />
        </button>
        <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <WerkstattProfileInhalt data={toProfil(w)} gross zeigeDistanz zeigeFahrzeugGruppen />
        </div>
      </div>
    </div>
  )
}
