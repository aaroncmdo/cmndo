// src/lib/offline/use-offline-data.ts
'use client'
import { useEffect, useState } from 'react'
import { resolveOfflineData, saveSnapshot, readSnapshot } from './snapshot'

/**
 * Online-SSR/prop path: pass serverData -> snapshot persisted, source='live'.
 * Offline path: omit serverData -> reads snapshot, source='snapshot'|'empty'.
 * DOM behavior covered by Playwright (no jsdom in unit env).
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
