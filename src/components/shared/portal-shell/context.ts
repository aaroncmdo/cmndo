'use client'

import { createContext, useContext } from 'react'

export type PortalShellDrawerContextValue = {
  /** true wenn die Sidebar innerhalb des PortalShell-Mobile-Drawers rendert →
   *  PortalNav rendert dann als Panel (kein self-positioning, kein Bottom-Nav). */
  inShellDrawer: boolean
  /** Schliesst den Drawer (Nav-Item-onClick). No-op ausserhalb des Drawers. */
  onNavigate: () => void
}

const PortalShellDrawerContext = createContext<PortalShellDrawerContextValue>({
  inShellDrawer: false,
  onNavigate: () => {},
})

export const PortalShellDrawerProvider = PortalShellDrawerContext.Provider

export function usePortalShellDrawer(): PortalShellDrawerContextValue {
  return useContext(PortalShellDrawerContext)
}
