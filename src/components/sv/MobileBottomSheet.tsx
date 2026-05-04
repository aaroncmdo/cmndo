'use client'

// Mobile-Bottom-Sheet mit zwei States: collapsed (Header sichtbar) und
// expanded (volles Sheet). Toggle per Tap auf den Header oder per Drag.
// Pure CSS-Animation — keine framer-motion-Abhängigkeit für diesen MVP.

import { useEffect, useRef, useState } from 'react'

export interface MobileBottomSheetProps {
  /** Inhalt der Collapsed-State zeigt — typisch nur Name des nächsten Stops. */
  header: React.ReactNode
  /** Vollständiger Inhalt im expanded State (scrollbar). */
  children: React.ReactNode
  /** Höhe des Headers im collapsed State. Default 80px. */
  collapsedHeightPx?: number
  /** Anteil der Viewport-Höhe wenn expanded. Default 0.85 (85%). */
  expandedRatio?: number
  /** Defaultzustand (collapsed). */
  defaultExpanded?: boolean
  /** Optional: Klassen für den Wrapper (z.B. extra md:hidden). */
  className?: string
}

export default function MobileBottomSheet({
  header,
  children,
  collapsedHeightPx = 80,
  expandedRatio = 0.85,
  defaultExpanded = false,
  className,
}: MobileBottomSheetProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const dragStartY = useRef<number | null>(null)
  const dragLastY = useRef<number | null>(null)

  // Body-Scroll-Lock wenn expanded — damit der Sheet-Inhalt scrollt, nicht
  // die Page dahinter
  useEffect(() => {
    if (!expanded) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [expanded])

  function onPointerDown(e: React.PointerEvent) {
    dragStartY.current = e.clientY
    dragLastY.current = e.clientY
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragStartY.current == null) return
    dragLastY.current = e.clientY
  }
  function onPointerUp() {
    if (dragStartY.current == null || dragLastY.current == null) {
      dragStartY.current = null
      dragLastY.current = null
      return
    }
    const delta = dragLastY.current - dragStartY.current
    // > 60px nach unten → collapse
    if (delta > 60) setExpanded(false)
    // > 60px nach oben → expand
    else if (delta < -60) setExpanded(true)
    // Sonst: kein State-Change (Tap-Toggle macht das onClick)
    dragStartY.current = null
    dragLastY.current = null
  }

  const sheetHeight = expanded
    ? `${Math.round(expandedRatio * 100)}vh`
    : `${collapsedHeightPx}px`

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 ${className ?? ''}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className="bg-white border-t border-claimondo-border rounded-t-2xl shadow-[0_-8px_32px_rgba(13,27,62,0.18)] flex flex-col overflow-hidden transition-[height] duration-300 ease-out"
        style={{ height: sheetHeight }}
      >
        {/* Drag-Handle + Header (klickbar) */}
        <div
          onClick={() => setExpanded((v) => !v)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="shrink-0 px-4 py-2.5 cursor-pointer touch-none select-none"
          role="button"
          aria-expanded={expanded}
          aria-label={expanded ? 'Sheet einklappen' : 'Sheet ausklappen'}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-claimondo-border mb-2" />
          {header}
        </div>

        {/* Body — nur sichtbar wenn expanded, scrollbar */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto transition-opacity duration-200 ${
            expanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
