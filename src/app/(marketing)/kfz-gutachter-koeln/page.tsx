import type { Metadata } from 'next'
import KfzGutachterStadtPage, {
  generateMetadata as stadtMeta,
} from '../../kfz-gutachter/[stadt]/page'
import { SITE_URL } from '@/lib/seo/jsonld'

// /kfz-gutachter-koeln — Google-Ads-Hijack-Route.
//
// Vorgeschichte: Eigenständige 9-Section-Page mit eigenem Lead-Form +
// 'kfz-gutachter-koeln-ads'-Source. Wurde 2026-05-14 konsolidiert
// (Marketing-Premium-Rework Sub-Projekt H): Inhalt rendert jetzt
// identisch zur kanonischen Stadt-Page /kfz-gutachter/koeln (15 Sections,
// Premium-Layout, Lokal-Block, JSON-LD LegalService mit per-City geo).
//
// Vorteile dieser Konsolidierung:
//   - Inhalt automatisch synced — keine Drift zwischen Ads-Route und
//     SEO-Stadt-Page
//   - Maik's Ads-Kampagne behält die /kfz-gutachter-koeln-URL
//   - canonical-Tag zeigt auf /kfz-gutachter/koeln (kein Duplicate-Content)
//   - StadtLeadFormClient mit source='kfz-gutachter-koeln' für Tracking
//
// Trade-off: bisherige source='kfz-gutachter-koeln-ads' wird zu
// 'kfz-gutachter-koeln'. Maik kann via Conversion-Label oder data-tracking-
// Attribut differenzieren, sobald die Konversionen scharf geschaltet sind.

const ALIAS_PARAMS = Promise.resolve({ stadt: 'koeln' })

export async function generateMetadata(): Promise<Metadata> {
  const meta = await stadtMeta({ params: ALIAS_PARAMS })
  // Canonical-Override: Suchmaschinen sehen /kfz-gutachter/koeln als
  // Primärseite. Ads-Kampagne weiterhin gegen /kfz-gutachter-koeln
  // schaltbar.
  return {
    ...meta,
    alternates: {
      ...meta.alternates,
      canonical: `${SITE_URL}/kfz-gutachter/koeln`,
    },
  }
}

export default async function Page() {
  return KfzGutachterStadtPage({ params: ALIAS_PARAMS })
}
