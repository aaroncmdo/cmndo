'use client'
import { useEffect, useState } from 'react'
import { resolveOfflineData, saveSnapshot, readSnapshot } from './snapshot'

/**
 * Online-SSR path: pass serverData -> snapshot is persisted, source='live'.
 * Offline/navigation: omit serverData -> reads snapshot, source='snapshot'|'empty'.
 * DOM behavior is covered by Playwright in later slices (no jsdom in unit env).
 */
export function useOfflineData<T>(
  key: string,
  opts: { serverData?: T; scope: string; role: string },
): { data: T | null; source: 'live' | 'snapshot' | 'empty'; staleSince: number | null } {
  const [state, setState] = useState(() =>
    resolveOfflineData<T>({ serverData: opts.serverData, snapshot: null }),
  )

  useEffect(() => {
    let cancelled = false
    if (opts.serverData !== undefined) {
      void saveSnapshot({ key, scope: opts.scope, role: opts.role, data: opts.serverData })
      setState(resolveOfflineData<T>({ serverData: opts.serverData, snapshot: null }))
    } else {
      void readSnapshot(key).then((snap) => {
        if (!cancelled) setState(resolveOfflineData<T>({ snapshot: snap }))
      })
    }
    return () => {
      cancelled = true
    }
  }, [key, opts.scope, opts.role, opts.serverData])

  return state
}
