'use client'

import { useEffect } from 'react'

// AAR-271: window.location.reload() statt unstable_retry()/reset() — bei
// Vercel 503 oder transientem Server-Fehler führt React-Recovery oft erneut
// zum gleichen Fehler. Full-Reload behält die aktuelle URL bei + Cookies
// bleiben erhalten → MA verliert keinen Lead-Arbeitsstand.
// „Zur Startseite"-Link entfernt — der redirected ohne Session auf /login,
// was bei einem transienten Server-Hick auf einer Lead-Seite nicht passt.

export default function Error({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div style={{ minHeight: '100vh', background: '#9900ff', color: 'white', padding: 24, fontFamily: 'monospace', fontSize: 12 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        🟣 APP ROOT CRASH (CMM-14 diag)
      </h1>
      <div style={{ marginBottom: 8 }}><strong>Message:</strong> {error.message || '(leer)'}</div>
      <div style={{ marginBottom: 8 }}><strong>Digest:</strong> {error.digest || '(keiner)'}</div>
      <div style={{ marginBottom: 8 }}><strong>Name:</strong> {error.name}</div>
      <pre style={{ background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10 }}>
        {error.stack || '(kein Stack)'}
      </pre>
      <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px', background: 'white', color: '#9900ff', border: 'none', borderRadius: 4, fontWeight: 700 }}>
        Seite neu laden
      </button>
    </div>
  )
}
