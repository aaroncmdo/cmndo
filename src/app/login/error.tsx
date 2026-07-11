// Token-Audit-Skip: Error-Boundary lädt vor Tailwind/CSS-Vars → inline-Hex nötig.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import { useEffect } from 'react'
import { reportBoundaryError } from '@/lib/observability/report-boundary-error'

// CMM-14: /login und /login/2fa hatten KEINE eigene error.tsx — ein Throw beim
// Rendern (z.B. transienter getUser-/MFA-Fehler auf /login/2fa) eskalierte zur
// lila Root-Boundary. Diese Boundary fängt die Login-Strecke jetzt ab: saubere,
// login-passende Seite + Capture (boundary='login', so lassen sich Login-Render-
// Throws in client_error_log von anderen Routen unterscheiden).

export default function LoginError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    console.error(error)
    reportBoundaryError('login', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: '#f8f9fb',
        fontFamily: "'Montserrat', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 400,
          width: '100%',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 18,
          padding: 32,
          textAlign: 'center',
          boxShadow: '0 8px 30px rgba(13,27,62,0.08)',
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
          <span style={{ color: '#0D1B3E' }}>Claim</span>
          <span style={{ color: '#4573A2' }}>ondo</span>
        </h1>
        <p style={{ fontSize: 14, color: '#4573A2', lineHeight: 1.5, margin: '0 0 24px' }}>
          Die Anmeldung konnte gerade nicht abgeschlossen werden. Bitte versuche es
          erneut.
        </p>
        <button
          onClick={() => {
            window.location.href = '/login'
          }}
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
          Zurück zum Login
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
