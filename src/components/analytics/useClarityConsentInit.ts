import { useEffect, useRef } from 'react'
import Clarity from '@microsoft/clarity'
import { hasTrackingConsent, CONSENT_CHANGED_EVENT } from '@/lib/analytics/consent'

// Consent-gated Microsoft-Clarity-Init (DSGVO). Geteilte Logik fuer ClarityInit
// (app-weit, mit SKIP_ROUTES) und ClarityInitLP (LP-eigene Project-ID + native
// GCM-consent/update als zusaetzlicher Gate-Trigger).
//
// - Initial: pruefe hasTrackingConsent() — bei Granted starte Clarity sofort
//   (Wiederkehrer mit gespeichertem Consent).
// - Lausche auf CONSENT_CHANGED_EVENT (CMP-Auswahl) — feuert beliebig oft, der
//   startedRef-Guard sorgt fuer Single-Init.
// - listenNativeGcm (LP-only): faengt zusaetzlich native gtag('consent','update')
//   -Pushes ab, indem dataLayer.push gewrappt wird. So startet Clarity auch dann,
//   wenn der Consent direkt via Google-Consent-Mode statt ueber das CMP-Event
//   gesetzt wird. Original-push bleibt unveraendert; Wrapper wird beim Unmount
//   sauber zurueckgebaut.
// - Mount-only: SPA-Navigation re-initialisiert Clarity NICHT.
export function useClarityConsentInit(
  projectId: string | undefined,
  options: { listenNativeGcm?: boolean } = {},
): void {
  const startedRef = useRef(false)
  const { listenNativeGcm = false } = options

  useEffect(() => {
    if (!projectId) return

    const start = () => {
      if (startedRef.current) return
      if (!hasTrackingConsent() && !(listenNativeGcm && analyticsGrantedViaDataLayer()))
        return
      startedRef.current = true
      Clarity.init(projectId)
    }

    // Sofort versuchen (Wiederkehrer) + auf die CMP-Consent-Auswahl hoeren.
    start()
    window.addEventListener(CONSENT_CHANGED_EVENT, start)

    // LP-only: native Google-Consent-Mode-Updates abfangen.
    let cleanupDl: (() => void) | undefined
    if (listenNativeGcm) {
      const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer
      if (Array.isArray(dl)) {
        const originalPush = dl.push.bind(dl)
        const wrappedPush: typeof dl.push = (...args) => {
          const result = originalPush(...args)
          for (const arg of args) {
            if (Array.isArray(arg) && arg[0] === 'consent' && arg[1] === 'update') {
              start()
            }
          }
          return result
        }
        dl.push = wrappedPush
        cleanupDl = () => {
          if (dl.push === wrappedPush) dl.push = originalPush
        }
      }
    }

    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, start)
      cleanupDl?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// Letzten 'consent'-Update-Eintrag im dataLayer pruefen — startet Clarity auch
// dann, wenn analytics_storage nativ via gtag('consent','update',{...}) auf
// granted gesetzt wurde (ohne CMP-Custom-Event).
function analyticsGrantedViaDataLayer(): boolean {
  if (typeof window === 'undefined') return false
  const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer
  if (!Array.isArray(dl)) return false
  for (let i = dl.length - 1; i >= 0; i--) {
    const entry = dl[i] as
      | readonly [unknown, unknown, { analytics_storage?: string }]
      | undefined
    if (
      Array.isArray(entry) &&
      entry[0] === 'consent' &&
      entry[1] === 'update' &&
      entry[2]?.analytics_storage === 'granted'
    ) {
      return true
    }
  }
  return false
}
