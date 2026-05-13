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
      style={{ background: 'var(--brand-primary, #0D1B3E)', fontFamily: 'Montserrat' }}
      buttonStyle={{
        background: 'var(--brand-secondary, #4573A2)',
        color: '#fff',
        fontSize: '14px',
        borderRadius: '6px',
        padding: '8px 20px',
      }}
      declineButtonStyle={{
        background: 'transparent',
        border: '1px solid #fff',
        color: '#fff',
        fontSize: '14px',
        borderRadius: '6px',
        padding: '8px 20px',
      }}
      expires={365}
    >
      Wir nutzen Cookies um die Funktionalität der Website zu gewährleisten
      und anonyme Nutzungs-Statistiken zu sammeln. Mehr Infos in unserer{' '}
      <a href="/datenschutz" style={{ color: 'var(--brand-accent, #6AAEF0)' }}>
        Datenschutzerklärung
      </a>
      .
    </CookieConsent>
  )
}
