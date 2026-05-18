'use client'

import CookieConsent from 'react-cookie-consent'
import { usePathname } from 'next/navigation'

// Authenticated-Portal-Pfade. Auf diesen ist der Cookie-Banner ausgeblendet
// — der User hat im Onboarding bereits Datenschutz akzeptiert, und der
// Banner verdeckt sonst Sidebar-Profile + Modal-Overlays.
const AUTHENTICATED_PREFIXES = [
  '/admin/',
  '/admin?',
  '/gutachter/',
  '/gutachter?',
  '/dispatch/',
  '/dispatch?',
  '/kunde/',
  '/kunde?',
  '/kanzlei/',
  '/kanzlei?',
  '/makler/',
  '/makler?',
  '/mitarbeiter/',
  '/faelle/',
  '/dev/',
]

function isAuthenticatedRoute(pathname: string | null): boolean {
  if (!pathname) return false
  // Exact-Matches fuer Portal-Roots ohne Trailing-Slash
  if (
    pathname === '/admin' ||
    pathname === '/gutachter' ||
    pathname === '/dispatch' ||
    pathname === '/kunde' ||
    pathname === '/kanzlei' ||
    pathname === '/makler'
  ) {
    return true
  }
  return AUTHENTICATED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function CookieBanner() {
  const pathname = usePathname()
  if (isAuthenticatedRoute(pathname)) return null

  return (
    <CookieConsent
      location="bottom"
      buttonText="Alle akzeptieren"
      declineButtonText="Nur notwendige"
      enableDeclineButton
      cookieName="claimondo-cookie-consent"
      // Mobile-Hygiene (18.05.2026): kompaktes 2-Zeilen-Layout — kurze
      // 1-Zeilen-Copy + schlanke Button-Reihe, damit der Banner die
      // Above-the-Fold-Zone auf Mobile so wenig wie möglich verdeckt.
      // Consent-Logik (react-cookie-consent) unverändert; paddingBottom
      // env(...) hält den Banner über der iOS-Home-Indicator-Zone clear.
      // containerClasses "cookie-banner-shifted" hebt den Banner auf
      // Mobile über die Sticky-CTA-Bars (LP + Stadt-Seiten) — Definition
      // in src/app/globals.css.
      containerClasses="cookie-banner-shifted"
      style={{
        background: 'var(--brand-primary, #0D1B3E)',
        fontFamily: 'Montserrat',
        padding: '8px 12px calc(8px + env(safe-area-inset-bottom, 0px))',
        alignItems: 'center',
        gap: '6px',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.18)',
      }}
      contentStyle={{
        flex: '1 1 auto',
        margin: 0,
        fontSize: '11.5px',
        lineHeight: '1.4',
      }}
      buttonWrapperClasses="cookie-banner-buttons"
      buttonStyle={{
        background: 'var(--brand-secondary, #4573A2)',
        color: '#fff',
        fontSize: '12.5px',
        fontWeight: 600,
        borderRadius: '999px',
        padding: '7px 15px',
        margin: '0 0 0 8px',
        minHeight: '40px',
      }}
      declineButtonStyle={{
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.5)',
        color: '#fff',
        fontSize: '12.5px',
        fontWeight: 600,
        borderRadius: '999px',
        padding: '7px 15px',
        margin: 0,
        minHeight: '40px',
      }}
      expires={365}
    >
      Cookies für Funktion und anonyme Statistik.{' '}
      <a
        href="/datenschutz"
        style={{ color: 'var(--brand-accent, #6AAEF0)', textDecoration: 'underline' }}
      >
        Datenschutz
      </a>
      .
    </CookieConsent>
  )
}
