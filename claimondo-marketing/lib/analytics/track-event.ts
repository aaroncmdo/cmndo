// Generischer GA4-Event-Helper fuer die Marketing-Site (claimondo.de).
// Spiegelt trackLpEvent (app/kfzgutachter-lp/track.ts), aber ohne LP-spezifische
// Default-Params -> nutzbar fuer Home-Hero-Form, Mini-Wizard + kuenftige Forms.
// Feuert auch bei Consent=denied: Google Consent Mode v2 (Advanced) sendet dann
// ein modelliertes, cookieloses Signal. No-op server-side / ohne geladenes gtag.
//
// Ambient-Typ fuer window.gtag ist im Projekt deklariert (vgl. trackLpEvent).
export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return
  if (!window.gtag) return
  window.gtag('event', name, params)
}
