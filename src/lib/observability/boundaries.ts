// Die erlaubten Kanaele fuer `client_error_log.boundary` — EINE Quelle.
//
// ⚠ WARUM DAS EIN EIGENES MODUL IST: `/api/client-error` setzt jeden Kanal, der
// hier fehlt, still auf 'unknown'. Ein Melder, dessen Kanal nicht eingetragen
// ist, schreibt also brav weiter — nur findet ihn danach keine Auswertung mehr.
// Stand die Liste im Route-File, konnte kein Test sie gegen die Melder pruefen;
// hier kann er es.

export const ALLOWED_BOUNDARIES = [
  'root',   // app/error.tsx
  'global', // app/global-error.tsx
  'login',  // app/login/error.tsx
  // Google-Maps-Zugang (25.08.2026) — gelesen vom Health-Check `google-maps-zugang`.
  'maps',        // Browser: gm_authFailure (Referrer/API/Billing abgelehnt)
  'maps-server', // Server: OVER_QUERY_LIMIT / REQUEST_DENIED
] as const

export type BoundaryKind = (typeof ALLOWED_BOUNDARIES)[number]

export function istErlaubterBoundary(wert: string): wert is BoundaryKind {
  return (ALLOWED_BOUNDARIES as readonly string[]).includes(wert)
}
