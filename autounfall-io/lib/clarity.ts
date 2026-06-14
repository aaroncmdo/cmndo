// Microsoft Clarity — Opt-out-Modell (Art. 6 Abs. 1 lit. f). Clarity laeuft im
// Sofort-Betrieb; der Nutzer kann ueber "Cookie-Einstellungen" im Footer
// widersprechen. Diese Helfer kapseln den (first-party, essenziellen) Opt-out-
// und Hinweis-Status in localStorage. Nur clientseitig aufrufen.

export const CLARITY_OPTOUT_KEY = 'au:clarity:optout'
export const CLARITY_NOTICE_KEY = 'au:clarity:notice-ack'

export function isClarityOptedOut(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(CLARITY_OPTOUT_KEY) === '1'
  } catch {
    return false
  }
}

/** Server-seitig true → Banner rendert nicht im SSR (keine Hydration-Diff). */
export function hasSeenClarityNotice(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(CLARITY_NOTICE_KEY) === '1'
  } catch {
    return true
  }
}

export function ackClarityNotice(): void {
  try {
    window.localStorage.setItem(CLARITY_NOTICE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function setClarityOptOut(optOut: boolean): void {
  try {
    if (optOut) window.localStorage.setItem(CLARITY_OPTOUT_KEY, '1')
    else window.localStorage.removeItem(CLARITY_OPTOUT_KEY)
    // Wahl getroffen → Hinweis nicht erneut zeigen.
    window.localStorage.setItem(CLARITY_NOTICE_KEY, '1')
  } catch {
    /* ignore */
  }
}
