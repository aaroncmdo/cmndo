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
      <body style={{ margin: 0, backgroundColor: '#09090b', fontFamily: "'Montserrat', system-ui, sans-serif" }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{ maxWidth: '700px', width: '100%', fontFamily: 'monospace', fontSize: 12, color: '#fff' }}>
            <div style={{ color: '#ef4444', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              GLOBAL ROOT CRASH — CMM-14 diagnose
            </div>
            <div style={{ marginBottom: 8 }}><strong>Message:</strong> {error.message || '(leer)'}</div>
            <div style={{ marginBottom: 8 }}><strong>Digest:</strong> {error.digest || '(keiner)'}</div>
            <div style={{ marginBottom: 8 }}><strong>Name:</strong> {error.name}</div>
            <pre style={{ background: '#1f1f23', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10 }}>
              {error.stack || '(kein Stack)'}
            </pre>
            <button
              onClick={() => unstable_retry()}
              style={{
                marginTop: 16,
                padding: '10px 20px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
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
