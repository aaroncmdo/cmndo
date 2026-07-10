'use client'
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

type Chrome = { title: string | null; actions: ReactNode | null }
const ValueCtx = createContext<Chrome>({ title: null, actions: null })
const SetCtx = createContext<(c: Chrome) => void>(() => {})

export function SvPageChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<Chrome>({ title: null, actions: null })
  const set = useCallback((c: Chrome) => setChrome(c), [])
  return (
    <SetCtx.Provider value={set}>
      <ValueCtx.Provider value={chrome}>{children}</ValueCtx.Provider>
    </SetCtx.Provider>
  )
}

/** Liest den aktuellen Chrome-State — NUR die Bars nutzen das. */
export function useSvPageChromeState(): Chrome {
  return useContext(ValueCtx)
}

/**
 * Seiten melden ihren Titel/Actions. Nutzt NUR den stabilen Setter-Context
 * -> die Seite re-rendert nicht, wenn der Chrome-State sich ändert (kein Loop).
 * Cleanup resettet auf null -> nächste Seite ohne Hook fällt auf die Map zurück.
 */
export function useSvPageChrome({ title, actions }: { title?: string; actions?: ReactNode }) {
  const set = useContext(SetCtx)
  const t = title ?? null
  const a = actions ?? null
  useEffect(() => {
    set({ title: t, actions: a })
    return () => set({ title: null, actions: null })
  }, [set, t, a])
}
