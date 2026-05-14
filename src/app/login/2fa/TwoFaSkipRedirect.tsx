'use client'

// AAR-2fa-loop-fix: Bridge-Component für User die auf /login/2fa landen
// ohne aktive 2FA. Setzt das Skip-Cookie via Server-Action und navigiert
// dann hart (window.location) zum Portal — `router.push` verlässt sich
// auf Client-Side-Cache und kann das frische Cookie übersehen.

import { useEffect, useRef, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { markTwoFaSkipForInactive } from '@/lib/auth/twofa/skip-cookie'

export default function TwoFaSkipRedirect({ targetPath }: { targetPath: string }) {
  const [error, setError] = useState<string | null>(null)
  const triggeredRef = useRef(false)

  useEffect(() => {
    if (triggeredRef.current) return
    triggeredRef.current = true
    markTwoFaSkipForInactive()
      .then((r) => {
        if (!r.ok) {
          setError(r.error ?? 'Weiterleitung fehlgeschlagen')
          return
        }
        // Hard-Navigate damit der neue Cookie definitiv mitgeschickt wird.
        window.location.href = targetPath
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Weiterleitung fehlgeschlagen')
      })
  }, [targetPath])

  return (
    <div className="min-h-screen flex items-center justify-center bg-claimondo-bg px-4">
      <div className="text-center space-y-3">
        {error ? (
          <>
            <p className="text-sm text-red-600">{error}</p>
            <a
              href={targetPath}
              className="inline-block px-4 py-2 rounded-ios-md bg-claimondo-navy text-white text-sm font-medium hover:bg-claimondo-shield"
            >
              Manuell zum Portal
            </a>
          </>
        ) : (
          <>
            <Loader2Icon className="w-6 h-6 mx-auto animate-spin text-claimondo-ondo" />
            <p className="text-sm text-claimondo-ondo">Weiterleitung …</p>
          </>
        )}
      </div>
    </div>
  )
}
