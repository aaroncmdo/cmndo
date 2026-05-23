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
