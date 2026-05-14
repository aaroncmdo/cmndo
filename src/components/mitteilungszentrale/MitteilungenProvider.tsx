'use client'

// AAR-892: Context-Provider für `useMitteilungen`. Verhindert, dass jeder
// `<UpdatesNav>`-Mount (z. B. Mobile-Header + Desktop-Top-Right in einem
// Portal-Layout) seinen eigenen Initial-Fetch + Realtime-Channel öffnet.
// Memory `feedback_realtime_channel_ids` hat die Crash-Variante via
// `useId()` schon entschärft — der Provider schließt die verbleibende
// Resource-Doppelung.

import { createContext, useContext, type ReactNode } from 'react'
import { useMitteilungen } from './useMitteilungen'

type ContextValue = ReturnType<typeof useMitteilungen>

const MitteilungenCtx = createContext<ContextValue | null>(null)

export function MitteilungenProvider({ children }: { children: ReactNode }) {
  const value = useMitteilungen()
  return <MitteilungenCtx.Provider value={value}>{children}</MitteilungenCtx.Provider>
}

export function useMitteilungenContext(): ContextValue {
  const v = useContext(MitteilungenCtx)
  if (!v) {
    throw new Error(
      'useMitteilungenContext muss innerhalb <MitteilungenProvider> verwendet werden — fehlt der Provider im Portal-Layout?',
    )
  }
  return v
}
