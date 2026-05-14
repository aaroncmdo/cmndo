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
      // Mobile-Hygiene: kompakter padding/font, Buttons stacken nicht den
      // Conversion-Form (Schaden-melden, Login). paddingBottom: env(...) lässt
      // den Banner über der iOS-Home-Indicator-Zone clear sitzen.
      style={{
        background: 'var(--brand-primary, #0D1B3E)',
        fontFamily: 'Montserrat',
        padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.18)',
      }}
      contentStyle={{
        flex: '1 1 auto',
        margin: 0,
        fontSize: '12px',
        lineHeight: '1.4',
      }}
      buttonWrapperClasses="cookie-banner-buttons"
      buttonStyle={{
        background: 'var(--brand-secondary, #4573A2)',
        color: '#fff',
        fontSize: '13px',
        fontWeight: 500,
        borderRadius: '999px',
        padding: '8px 16px',
        margin: '0 0 0 8px',
        minHeight: '40px',
      }}
      declineButtonStyle={{
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.6)',
        color: '#fff',
        fontSize: '13px',
        fontWeight: 500,
        borderRadius: '999px',
        padding: '8px 16px',
        margin: 0,
        minHeight: '40px',
      }}
      expires={365}
    >
      Wir nutzen Cookies für Funktionalität + anonyme Statistiken.{' '}
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
