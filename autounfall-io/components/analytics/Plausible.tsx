import Script from 'next/script'
import { SITE } from '@/lib/site'

// Cookieloses Analytics (Plausible). KEIN GA4 / Google-Ads / Clarity, keine
// Cross-Property-Bridge — bewusste Standalone-Entscheidung (02_REGELN §2).
export function Plausible() {
  if (!SITE.plausibleDomain) return null
  return (
    <Script
      defer
      src="https://plausible.io/js/script.js"
      data-domain={SITE.plausibleDomain}
      strategy="afterInteractive"
    />
  )
}
