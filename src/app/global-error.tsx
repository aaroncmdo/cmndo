// Token-Audit-Skip: Error-Boundary lädt vor Tailwind/CSS-Vars → inline-Hex nötig.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import { useEffect } from 'react'
import { reportBoundaryError } from '@/lib/observability/report-boundary-error'

// CMM-14: global-error fängt Throws im Root-Layout selbst (ersetzt das komplette
// Dokument). Früher rohes Diagnose-Dump — jetzt gebrandet + Capture in
// client_error_log. window.location.reload() statt reset() (AAR-271).

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    console.error(error)
    reportBoundaryError('global', error)
  }, [error])

  return (
    <html lang="de">
      <body style={{ margin: 0, backgroundColor: '#f8f9fb', fontFamily: "'Montserrat', system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
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
              Die Anwendung konnte nicht geladen werden. Bitte lade die Seite neu.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                backgroundColor: '#0D1B3E',
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
      </body>
    </html>
  )
}
