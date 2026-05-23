'use client'

// Route-Segment-Error-Boundary (muss Client-Component sein). Faengt Render-/
// Daten-Fehler im Root-Segment ab und bietet einen Reset.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="container-prose px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-bold text-au-ink">Etwas ist schiefgelaufen</h1>
      <p className="mt-4 text-au-ink-soft">
        Bitte laden Sie die Seite neu. Falls das Problem bestehen bleibt, versuchen Sie es später
        erneut.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-au-muted">Referenz: {error.digest}</p>
      ) : null}
      <button
        onClick={reset}
        className="mt-8 rounded-ios-md bg-au-amber px-5 py-2.5 text-sm font-medium text-au-surface transition-opacity hover:opacity-90"
      >
        Erneut versuchen
      </button>
    </div>
  )
}
