'use client'

import CookieConsent from 'react-cookie-consent'

export function CookieBanner() {
  return (
    <CookieConsent
      location="bottom"
      buttonText="Alle akzeptieren"
      declineButtonText="Nur notwendige"
      enableDeclineButton
      cookieName="claimondo-cookie-consent"
      style={{ background: '#0D1B3E', fontFamily: 'Montserrat' }}
      buttonStyle={{
        background: '#4573A2',
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
      Wir nutzen Cookies um die Funktionalitaet der Website zu gewaehrleisten
      und anonyme Nutzungs-Statistiken zu sammeln. Mehr Infos in unserer{' '}
      <a href="/datenschutz" style={{ color: '#6AAEF0' }}>
        Datenschutzerklaerung
      </a>
      .
    </CookieConsent>
  )
}
