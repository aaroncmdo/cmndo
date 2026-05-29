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
//   -Grants ab, die NICHT ueber das CMP-Event laufen. Wir POLLEN dafuer den
//   dataLayer (statt dataLayer.push zu wrappen): GTM (gtm.js, afterInteractive)
//   ERSETZT dataLayer.push nach unserem Mount und wuerde einen push-Wrapper
//   clobbern — Polling liest dagegen nur die dataLayer-Eintraege, die unabhaengig
//   vom push-Owner im Array bleiben, und matcht Array- UND gtag()-Arguments-Form.
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

    // LP-only: GCM-native Consent-Grants per dataLayer-Polling abfangen
    // (robust gegen GTMs push-Ersetzung). Stoppt bei Init oder nach ~20s.
    let pollId: ReturnType<typeof setInterval> | undefined
    if (listenNativeGcm) {
      let ticks = 0
      pollId = setInterval(() => {
        ticks += 1
        start()
        if (startedRef.current || ticks >= 40) {
          if (pollId) clearInterval(pollId)
        }
      }, 500)
    }

    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, start)
      if (pollId) clearInterval(pollId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// Letzten 'consent'-Update-Eintrag im dataLayer pruefen — startet Clarity auch
// dann, wenn analytics_storage nativ via gtag('consent','update',{...}) auf
// granted gesetzt wurde (ohne CMP-Custom-Event). Matcht BEIDE Push-Formen:
// das gtag()-Arguments-Objekt (keine Array!) und die Array-Form der CMP.
function analyticsGrantedViaDataLayer(): boolean {
  if (typeof window === 'undefined') return false
  const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer
  if (!Array.isArray(dl)) return false
  for (let i = dl.length - 1; i >= 0; i--) {
    // Array UND Arguments-Objekt sind index-zugreifbar (e[0]/e[1]/e[2]).
    const e = dl[i] as { [k: number]: unknown } | null | undefined
    if (
      e != null &&
      typeof e === 'object' &&
      e[0] === 'consent' &&
      e[1] === 'update' &&
      (e[2] as { analytics_storage?: string } | undefined)?.analytics_storage === 'granted'
    ) {
      return true
    }
  }
  return false
}
