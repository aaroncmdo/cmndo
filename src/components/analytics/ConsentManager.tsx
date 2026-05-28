'use client'

import { useEffect } from 'react'
import * as CookieConsent from 'vanilla-cookieconsent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import { CONSENT_CHANGED_EVENT, CONSENT_POLICY_VERSION, categoriesToGcm, type ConsentState } from '@/lib/analytics/consent'

function currentState(): ConsentState {
  return { statistics: CookieConsent.acceptedCategory('analytics'), marketing: CookieConsent.acceptedCategory('ads') }
}

function applyConsent() {
  const state = currentState()
  try { window.gtag?.('consent', 'update', categoriesToGcm(state)) } catch {}
  try { window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT)) } catch {}
  try {
    void fetch('/api/consent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categories: ['necessary', state.statistics && 'analytics', state.marketing && 'ads'].filter(Boolean),
        policyVersion: CONSENT_POLICY_VERSION,
      }),
      keepalive: true,
    })
  } catch {}
}

export function ConsentManager() {
  useEffect(() => {
    void CookieConsent.run({
      guiOptions: { consentModal: { layout: 'box', position: 'bottom left' }, preferencesModal: { layout: 'box' } },
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
              description: 'Wir nutzen Cookies fuer Statistik und Marketing. Notwendige Cookies sind immer aktiv. Du kannst frei waehlen und jederzeit widerrufen.',
              acceptAllBtn: 'Alle akzeptieren',
              acceptNecessaryBtn: 'Ablehnen',
              showPreferencesBtn: 'Einstellungen',
            },
            preferencesModal: {
              title: 'Cookie-Einstellungen',
              acceptAllBtn: 'Alle akzeptieren',
              acceptNecessaryBtn: 'Ablehnen',
              savePreferencesBtn: 'Auswahl speichern',
              sections: [
                { title: 'Notwendig', description: 'Fuer den Betrieb erforderlich.', linkedCategory: 'necessary' },
                { title: 'Statistik', description: 'Google Analytics, Microsoft Clarity.', linkedCategory: 'analytics' },
                { title: 'Marketing', description: 'Google Ads Conversion-Messung.', linkedCategory: 'ads' },
              ],
            },
          },
        },
      },
      onFirstConsent: applyConsent,
      onConsent: applyConsent,
      onChange: applyConsent,
    })
  }, [])
  return null
}

/** Fuer den Footer-Widerruf-Link. */
export function openConsentPreferences() { try { CookieConsent.showPreferences() } catch {} }
