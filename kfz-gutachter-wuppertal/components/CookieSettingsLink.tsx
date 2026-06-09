'use client'

import { openConsentPreferences } from './CookieConsent'

// Footer-Widerruf-Link (Art. 7 Abs. 3 DSGVO — Widerruf so einfach wie die Einwilligung):
// oeffnet den Consent-Banner erneut, damit ein Nutzer seine Cookie-Wahl jederzeit aendern
// kann. Client-Component, weil openConsentPreferences() ein window-Event ('cc:open')
// dispatcht, das die CookieConsentBanner-Instanz empfaengt. Optik = wie die Impressum/
// Datenschutz-Links daneben (Tailwind-Preflight resettet Button-Hintergrund/Border/Font).
export function CookieSettingsLink() {
  return (
    <button
      type="button"
      onClick={openConsentPreferences}
      className="p-0 cursor-pointer hover:text-white transition"
    >
      Cookie-Einstellungen
    </button>
  )
}
