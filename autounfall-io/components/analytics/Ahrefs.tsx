import Script from 'next/script'

// Cookieloses Web-Analytics (Ahrefs Web Analytics). Footprint-neutral, setzt keine
// Cookies -> keine Consent-Verschaerfung (laeuft wie Plausible ohne Opt-in). data-key
// ist der oeffentliche Property-Key (kein Secret), verbatim aus der Ahrefs-Property.
export function AhrefsAnalytics() {
  return (
    <Script
      src="https://analytics.ahrefs.com/analytics.js"
      data-key="LAdk06/X5L8FJL/DRNZhhA"
      strategy="afterInteractive"
    />
  )
}
