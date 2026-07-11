// CMM-14 Observability: fire-and-forget Erfassung eines Error-Boundary-Treffers
// in client_error_log (via /api/client-error). Genutzt von error.tsx /
// global-error.tsx / login/error.tsx. Ziel: der exakte digest+stack des
// naechsten "lila Root-Crash" ist per Supabase-MCP auslesbar, ohne Sentry-
// Zugriff. Darf NIE werfen (sonst verschlimmert die Erfassung den Fehlerfall).

export type BoundaryKind = 'root' | 'global' | 'login'

export function reportBoundaryError(
  boundary: BoundaryKind,
  error: (Error & { digest?: string }) | null | undefined,
): void {
  try {
    const payload = {
      boundary,
      digest: error?.digest ?? null,
      name: error?.name ?? null,
      message: error?.message ?? null,
      stack: error?.stack ?? null,
      pathname: typeof window !== 'undefined' ? window.location.pathname : null,
    }
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      // keepalive: Report ueberlebt auch einen unmittelbar folgenden Reload.
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* egal */
  }
}
