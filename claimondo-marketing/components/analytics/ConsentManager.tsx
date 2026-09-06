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
              description: 'Wir nutzen Cookies für Statistik und Marketing. Notwendige Cookies sind immer aktiv. Sie können frei wählen und jederzeit widerrufen.',
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
                { title: 'Notwendig', description: 'Für den Betrieb erforderlich.', linkedCategory: 'necessary' },
                // ProvenExpert stand hier, solange das ProSeal an dieser Kategorie hing.
                // Seit 13.08.2026 laedt es unabhaengig vom CMP (Art. 6 Abs. 1 lit. f,
                // Datenschutzerklaerung 9.6) — es hier weiter zu nennen, wuerde eine
                // Steuerung vorspiegeln, die dieser Schalter nicht hat. Das waere
                // schlimmer als gar kein Hinweis.
                { title: 'Statistik', description: 'Google Analytics, Microsoft Clarity.', linkedCategory: 'analytics' },
                // OpenAI mitgenannt, seit der Measurement Pixel an dieser Kategorie haengt
                // (04.09.2026). Wer hier zustimmt, soll wissen, wohin die Messung geht —
                // ein Schalter, der mehr steuert als er benennt, ist keine Einwilligung.
                { title: 'Marketing', description: 'Conversion-Messung für Google Ads und für Werbeanzeigen in ChatGPT (OpenAI).', linkedCategory: 'ads' },
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
