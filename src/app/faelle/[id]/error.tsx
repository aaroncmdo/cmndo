'use client'

// AAR-271: window.location.reload() statt reset()
// AAR-650: Error-Message + Digest anzeigen damit der konkrete Ursache-Stack
// direkt sichtbar ist (bisher nur „Fehler beim Laden" → keine Debug-Info).
// AAR-664: Stack-Trace zusätzlich anzeigen + in Console loggen, weil Sentry
// diesen Crash nicht gefangen hat. Mit Production-Source-Maps mapped der
// Stack zurück auf Source-File:Line — kann via Copy-Button geteilt werden.
import { useEffect, useState } from 'react'

export default function FallakteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    console.error('[AAR-664] Fallakte-Crash:', error)
  }, [error])

  const fullReport = [
    `Message: ${error.message ?? '(keine)'}`,
    `Digest: ${error.digest ?? '(kein)'}`,
    `URL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
    `Stack:`,
    error.stack ?? '(kein Stack)',
  ].join('\n')

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-3xl w-full">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">!</span>
        </div>
        <h1 className="text-lg font-semibold text-claimondo-navy mb-2">Fehler beim Laden des Falls</h1>
        <p className="text-sm text-claimondo-ondo mb-4">
          Bitte versuchen Sie es erneut. Falls das Problem bestehen bleibt, kontaktieren Sie den Support mit folgender Info.
        </p>
        {(error.message || error.digest || error.stack) && (
          <div className="text-left mb-3 rounded-ios-lg bg-claimondo-bg border border-claimondo-border px-3 py-2.5 space-y-2 max-h-80 overflow-y-auto">
            {error.message && (
              <p className="text-[11px] font-mono text-claimondo-navy break-all">{error.message}</p>
            )}
            {error.digest && (
              <p className="text-[10px] font-mono text-claimondo-ondo/70">digest: {error.digest}</p>
            )}
            {error.stack && (
              <pre className="text-[10px] font-mono text-claimondo-ondo whitespace-pre-wrap break-all">{error.stack}</pre>
            )}
          </div>
        )}
        <div className="flex items-center justify-center gap-2 mb-3">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(fullReport)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              } catch {
                /* noop */
              }
            }}
            className="px-4 py-2 bg-white border border-claimondo-border text-claimondo-navy font-medium text-xs rounded-ios-lg hover:bg-claimondo-bg transition-colors"
          >
            {copied ? 'Kopiert ✓' : 'Fehlerbericht kopieren'}
          </button>
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 bg-claimondo-ondo text-white font-medium text-sm rounded-ios-xl hover:bg-claimondo-shield transition-colors"
          >
            Erneut versuchen
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-white border border-claimondo-border text-claimondo-navy font-medium text-sm rounded-ios-xl hover:bg-claimondo-bg transition-colors"
          >
            Seite neu laden
          </button>
        </div>
      </div>
    </div>
  )
}
