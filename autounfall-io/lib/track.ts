// Plausible-Custom-Events (cookielos). KEIN GA4/Clarity. window.plausible wird
// vom Plausible-Script bereitgestellt; vor dem Laden queued das Script die Calls.
// Wir guarden defensiv, damit ein nicht geladenes Script (Adblock) nie crasht.

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number | boolean> },
    ) => void
  }
}

/**
 * Feuert das `tool_complete`-Goal, sobald ein Tool ein verwertbares Ergebnis
 * zeigt (Rechner berechnet, Checker-Ergebnis, Wizard-Plan, Bericht erzeugt).
 * `tool` als Prop, damit ein einziges Goal alle Werkzeuge segmentiert.
 */
export function trackToolComplete(tool: string): void {
  if (typeof window !== 'undefined' && typeof window.plausible === 'function') {
    window.plausible('tool_complete', { props: { tool } })
  }
}

/** Lead-Formular abgeschickt + serverseitig erfolgreich konvertiert (WP-6). */
export function trackLeadSubmit(ref?: string): void {
  if (typeof window !== 'undefined' && typeof window.plausible === 'function') {
    window.plausible('lead_submit', ref ? { props: { ref } } : undefined)
  }
}

/** CTA-Klick auf den Anfrage-Button (vor dem Absenden). */
export function trackCtaClick(location: string): void {
  if (typeof window !== 'undefined' && typeof window.plausible === 'function') {
    window.plausible('cta_click', { props: { location } })
  }
}
