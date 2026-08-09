// AAR-login-embed / AAR-939 — zentrale Host-Konstante + Snippet-Builder (PURE).
//
// Die Embed-Bundles (monika.js / claimondo-login.js) liegen unter public/embed
// und werden von der Next-App auf app.claimondo.de ausgeliefert. Die Marketing-
// Domain claimondo.de hostet /embed/* NICHT (404) — Snippets MUESSEN auf
// app.claimondo.de zeigen. Bewusst hart auf Prod: der SV klebt das Snippet auf
// seine EIGENE Website; das Widget muss von Prod laden, nicht vom Preview-/Staging-
// Host, der die Einstellungen-Seite gerade rendert.

export const EMBED_SCRIPT_HOST = 'https://app.claimondo.de'

/** Schaden-Widget (Monika) — oeffnet das Anfrage-Formular. */
export function monikaSnippet(slug: string): string {
  return `<script src="${EMBED_SCRIPT_HOST}/embed/monika.js" data-site-id="${slug}" defer></script>`
}

/** Gebrandeter Login-Button fuer die Kunden des SV. */
export function loginSnippet(slug: string): string {
  return `<script src="${EMBED_SCRIPT_HOST}/embed/claimondo-login.js" data-site-id="${slug}" defer></script>`
}
