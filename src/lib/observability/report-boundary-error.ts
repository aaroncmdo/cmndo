// CMM-14 Observability: fire-and-forget Erfassung eines Error-Boundary-Treffers
// in client_error_log (via /api/client-error). Genutzt von error.tsx /
// global-error.tsx / login/error.tsx. Ziel: der exakte digest+stack des
// naechsten "lila Root-Crash" ist per Supabase-MCP auslesbar, ohne Sentry-
// Zugriff. Darf NIE werfen (sonst verschlimmert die Erfassung den Fehlerfall).

import type { BoundaryKind } from './boundaries'

export type { BoundaryKind }

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

/**
 * Meldet, dass die Google-Maps-JS-API den Zugriff verweigert hat.
 *
 * ⚠ WAS HIER ANKOMMT: Google ruft die globale Funktion `gm_authFailure` auf,
 * wenn der Schluessel abgelehnt wird — falscher Referrer, gesperrte API,
 * abgeschaltetes Billing. Ohne diesen Haken merkt es NIEMAND ausser dem Nutzer:
 * die Karte bleibt grau, das Adressfeld liefert keine Vorschlaege, und in der
 * Serverlage sieht alles gesund aus. Genau so lief der Ausfall vom 29.06.
 *
 * ⚠ Der Haken ist besonders wichtig, seit der Browser-Schluessel (25.08.) auf
 * unsere Domains eingeschraenkt ist: Fehlt dort eine Domain, stirbt die Karte
 * genau dort — und nur dort. Ohne Meldung faellt das erst einem Kunden auf.
 */
export function reportMapsAuthFehler(detail?: string): void {
  reportBoundaryError('maps', {
    name: 'gm_authFailure',
    message: detail ?? 'Google Maps hat den Schlüssel abgelehnt (Referrer, API oder Billing).',
  } as Error)
}
