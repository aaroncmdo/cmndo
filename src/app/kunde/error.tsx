// Token-Audit-Skip: Error-Boundary lädt vor Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import { useEffect } from 'react'

export default function KundeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[CMM-14 KUNDE LAYOUT ERROR BOUNDARY]', error)
  }, [error])

  return (
    <div style={{ minHeight: '100vh', background: '#ff8800', color: 'white', padding: 24, fontFamily: 'monospace', fontSize: 12 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        🟠 KUNDE LAYOUT CRASH (CMM-14 diag)
      </h1>
      <div style={{ marginBottom: 8 }}><strong>Message:</strong> {error.message || '(leer)'}</div>
      <div style={{ marginBottom: 8 }}><strong>Digest:</strong> {error.digest || '(keiner)'}</div>
      <div style={{ marginBottom: 8 }}><strong>Name:</strong> {error.name}</div>
      <pre style={{ background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10 }}>
        {error.stack || '(kein Stack)'}
      </pre>
      <button onClick={reset} style={{ marginTop: 16, padding: '8px 16px', background: 'white', color: '#ff8800', border: 'none', borderRadius: 4, fontWeight: 700 }}>
        Erneut versuchen
      </button>
    </div>
  )
}
