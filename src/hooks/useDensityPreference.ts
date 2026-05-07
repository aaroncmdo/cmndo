'use client'

// 2026-05-07 Design-Review Item 1.5: Density-Toggle pro Liste mit
// localStorage-Persistenz. Verwendet z.B. von Dispatch-Leads-Liste,
// SV-Liste, Aufträge-Liste, Termine-Liste.
//
// Pattern: jede Liste übergibt einen `listKey` (z.B. 'dispatch-leads'),
// der Hook liefert `[density, setDensity]` und persistiert die Wahl
// in `density:<listKey>`.

import { useEffect, useState, useCallback } from 'react'

export type Density = 'comfortable' | 'compact'

const KEY_PREFIX = 'density:'

function readStored(listKey: string): Density {
  if (typeof window === 'undefined') return 'comfortable'
  try {
    const v = window.localStorage.getItem(KEY_PREFIX + listKey)
    return v === 'compact' ? 'compact' : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

export function useDensityPreference(listKey: string): [Density, (d: Density) => void] {
  // SSR-safe: erstes Render immer 'comfortable', dann Hydration sync.
  const [density, setDensityState] = useState<Density>('comfortable')

  useEffect(() => {
    setDensityState(readStored(listKey))
  }, [listKey])

  const setDensity = useCallback(
    (d: Density) => {
      setDensityState(d)
      try {
        window.localStorage.setItem(KEY_PREFIX + listKey, d)
      } catch { /* private mode */ }
    },
    [listKey],
  )

  return [density, setDensity]
}
