'use client'

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="de">
      <body style={{ margin: 0, backgroundColor: '#09090b', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div style={{ color: '#ef4444', fontSize: '48px', marginBottom: '16px' }}>!</div>
            <h1 style={{ color: '#fff', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
              Kritischer Fehler
            </h1>
            <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5 }}>
              Die Anwendung konnte nicht geladen werden. Bitte versuchen Sie es erneut.
            </p>
            <button
              onClick={() => unstable_retry()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
