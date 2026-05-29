import Script from 'next/script'
import { SITE } from '@/lib/site'
import { CLUSTER, type City } from '@/lib/cluster'

// Platzhalter fuer das Monika-Anfrage-Widget (Plan 2 / Phase 2).
// Phase 1: NEXT_PUBLIC_MONIKA_EMBED_ENABLED leer → rendert NULL (kein Widget).
// Phase 2: ENV="true" → laedt claimondo.de/embed/monika.js. KEIN Code-Rewrite
// noetig, nur ENV setzen + Re-Deploy. Anfragen landen ausschliesslich im
// claimondo-Backend (nie in dieser LP).
export function MonikaEmbedSlot({ city }: { city: City }) {
  if (!SITE.monikaEnabled) return null
  return (
    <Script
      src={`${SITE.embedBase}/embed/monika.js`}
      strategy="lazyOnload"
      data-cluster={CLUSTER.key}
      data-stadt={city.slug}
      data-theme={CLUSTER.theme}
      data-phone={CLUSTER.phone.tel}
      data-wa={CLUSTER.phone.wa}
    />
  )
}
