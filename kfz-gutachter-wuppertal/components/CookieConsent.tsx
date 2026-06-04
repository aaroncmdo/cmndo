'use client'

import { useEffect } from 'react'
import * as CookieConsent from 'vanilla-cookieconsent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'

// Cookie-Consent fuer die Cluster-LPs (AAR-967). Look = Haupt-App claimondo.de:
// vanilla-cookieconsent (orestbida v3), Box bottom-left, Kategorien necessary/
// analytics/ads. Standalone nachgebaut — KEINE Imports aus dem Haupt-App und kein
// /api/consent (existiert in der Standalone-App nicht). Consent steuert Google
// Consent Mode v2 (gtag) + wird in cc_cookie persistiert.
// window.gtag ist global in lib/tracking.ts getypt -> hier kein Re-Declare.

function applyConsent(): void {
  const statistics = CookieConsent.acceptedCategory('analytics')
  const marketing = CookieConsent.acceptedCategory('ads')
  const g = (granted: boolean): 'granted' | 'denied' => (granted ? 'granted' : 'denied')
  try {
    window.gtag?.('consent', 'update', {
      analytics_storage: g(statistics),
      functionality_storage: g(statistics),
      ad_storage: g(marketing),
      ad_user_data: g(marketing),
      ad_personalization: g(marketing),
    })
  } catch {
    // gtag evtl. nicht geladen (Phase 1 ohne Tracking-ENV) — Wahl bleibt in cc_cookie.
  }
}

export function CookieConsentBanner() {
  useEffect(() => {
    if (typeof window !== 'undefined') console.log('[cc] init run=', typeof CookieConsent.run)
    Promise.resolve(CookieConsent.run({
      autoShow: true,
      guiOptions: {
        consentModal: { layout: 'box', position: 'bottom left' },
        preferencesModal: { layout: 'box' },
      },
      categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: {},
        ads: {},
      },
      language: {
        default: 'de',
        translations: {
          de: {
            consentModal: {
              title: 'Wir verwenden Cookies',
              description:
                'Wir nutzen Cookies für Statistik und Marketing. Notwendige Cookies sind immer aktiv. Sie können frei wählen und Ihre Einwilligung jederzeit widerrufen.',
              acceptAllBtn: 'Alle akzeptieren',
              acceptNecessaryBtn: 'Ablehnen',
              showPreferencesBtn: 'Einstellungen',
            },
            preferencesModal: {
              title: 'Cookie-Einstellungen',
              acceptAllBtn: 'Alle akzeptieren',
              acceptNecessaryBtn: 'Ablehnen',
              savePreferencesBtn: 'Auswahl speichern',
              closeIconLabel: 'Schließen',
              sections: [
                { title: 'Notwendig', description: 'Für den Betrieb der Seite erforderlich. Immer aktiv.', linkedCategory: 'necessary' },
                { title: 'Statistik', description: 'Reichweitenmessung (Google Analytics, Microsoft Clarity).', linkedCategory: 'analytics' },
                { title: 'Marketing', description: 'Conversion-Messung für Google Ads.', linkedCategory: 'ads' },
              ],
            },
          },
        },
      },
      onFirstConsent: applyConsent,
      onConsent: applyConsent,
      onChange: applyConsent,
    }))
      .then(() => console.log('[cc] ok modal=', !!document.getElementById('cc-main')))
      .catch((e) => console.error('[cc] failed', e))
  }, [])
  return null
}

/** Optionaler Widerruf-Trigger (z. B. Footer-Link). */
export function openConsentPreferences(): void {
  try {
    CookieConsent.showPreferences()
  } catch {
    // noop
  }
}
