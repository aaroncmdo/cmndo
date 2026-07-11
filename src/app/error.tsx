// Token-Audit-Skip: Error-Boundary lädt vor Tailwind/CSS-Vars → inline-Hex nötig.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import { useEffect } from 'react'
import { reportBoundaryError } from '@/lib/observability/report-boundary-error'

// CMM-14: Diese Root-Boundary fängt jeden Throw eines Top-Level-Portal-Layouts
// (die rollen-eigene error.tsx fängt das layout.tsx ihres Segments NICHT).
// Früher zeigte sie ein rohes lila Diagnose-Dump ("APP ROOT CRASH") — jetzt eine
// gebrandete, freundliche Seite + fire-and-forget-Capture in client_error_log,
// damit der exakte Fehler auch ohne Sentry-Zugriff auffindbar bleibt.
//
// AAR-271: window.location.reload() statt unstable_retry()/reset() — React-
// Recovery führt bei transienten Server-Fehlern oft erneut zum gleichen Fehler.
// Full-Reload behält URL + Cookies → kein Verlust des Arbeitsstands.

export default function Error({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    console.error(error)
    reportBoundaryError('root', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#f8f9fb',
        fontFamily: "'Montserrat', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 18,
          padding: 32,
          textAlign: 'center',
          boxShadow: '0 8px 30px rgba(13,27,62,0.08)',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }} aria-hidden>🛠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B3E', margin: '0 0 8px' }}>
          Da ist etwas schiefgelaufen
        </h1>
        <p style={{ fontSize: 14, color: '#4573A2', lineHeight: 1.5, margin: '0 0 24px' }}>
          Diese Seite konnte gerade nicht geladen werden. Bitte versuche es erneut —
          meist genügt ein einfaches Neuladen.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 24px',
            background: '#0D1B3E',
            color: '#ffffff',
            border: 'none',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Seite neu laden
        </button>
        {error.digest && (
          <p style={{ marginTop: 20, fontSize: 11, color: '#94a3b8' }}>
            Fehler-Referenz: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
