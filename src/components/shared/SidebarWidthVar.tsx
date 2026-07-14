'use client'
import { useEffect } from 'react'
import { SIDEBAR_WIDTH_PROP } from '@/components/primitives/overlay/overlay-layers'

type Props = {
  /** Sidebar-Breite inkl. Layout-Padding, z.B. '224px'. */
  width: string
  /** Ab wann die Sidebar sichtbar ist. Darunter -> 0px. */
  breakpoint?: string
}

/**
 * Setzt --app-sidebar-width auf <html>.
 *
 * Die Property ist die Trennlinie zwischen den beiden Haelften des Overlay-
 * Schleiers (src/components/primitives/overlay/overlay-layers.ts): links davon
 * der Streifen UNTER der Sidebar, rechts davon der Content-Schleier UEBER dem
 * Content. Zusaetzlich zentriert der Dispatch-FAB darueber im Content-Bereich.
 *
 * Headless (rendert null) — damit es auch aus Server-Layouts heraus benutzbar
 * ist (Kunde-Portal).
 */
export function SidebarWidthVar({ width, breakpoint = '(min-width: 768px)' }: Props) {
  useEffect(() => {
    const mql = window.matchMedia(breakpoint)
    const apply = () => {
      document.documentElement.style.setProperty(
        SIDEBAR_WIDTH_PROP,
        mql.matches ? width : '0px',
      )
    }
    apply()
    mql.addEventListener('change', apply)
    return () => {
      mql.removeEventListener('change', apply)
      document.documentElement.style.removeProperty(SIDEBAR_WIDTH_PROP)
    }
  }, [width, breakpoint])

  return null
}
