import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  serviceSchema, breadcrumbsSchema, organizationSchema, faqPageSchema,
  jsonLdScript, GUTACHTER_LANDING_URL, SITE_URL,
} from '@/lib/seo/jsonld'
import { getRouteLastUpdatedISO } from '@/lib/seo/freshness'
import { getTranslations } from 'next-intl/server'
import { buildLanguageAlternates } from '@/lib/seo/alternates'
import GutachterPartnerClient from './GutachterPartnerClient'
import { PartnerContent } from '@/components/gutachter-partner/PartnerContent'
import { PARTNER_FAQ } from '@/components/gutachter-partner/partner-faq'
import { PartnerFooter } from '@/components/gutachter-partner/PartnerFooter'

export const revalidate = 3600 // Netzwerk-Zahl 1× pro Stunde aktualisieren

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('gutachter_partner.title'),
    description: t('gutachter_partner.description'),
    keywords: [
      'Kfz-Sachverständiger werden',
      'SV-Netzwerk beitreten',
      'Gutachter Aufträge',
      'Kfz-Gutachter Partner',
      'BVSK Partner',
      'Claimondo SV-Partner',
      'Kfz-Gutachter selbstständig',
      'Aufträge Sachverständiger',
      'Partner werden Sachverständiger',
    ],
    alternates: {
      canonical: `${GUTACHTER_LANDING_URL}/`,
      ...buildLanguageAlternates('/gutachter-partner'),
    },
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${GUTACHTER_LANDING_URL}/`,
      title: t('gutachter_partner.og_title'),
      description: t('gutachter_partner.og_description'),
    },
    twitter: {
      card: 'summary_large_image',
      title: t('gutachter_partner.og_title'),
      description: t('gutachter_partner.twitter_description'),
    },
  }
}

// Sofort-Start-Umbau 04.08.: getWartelisteAnzahl entfernt — das Warteliste-Framing
// (inkl. WaitlistApply-Formular, 0 Consumer) ist dem Freemium-Self-Service gewichen.

// Netzwerk-Größe für den serviceSchema-Claim: SV-Leads (gesamter Pool, alle Quellen)
// + aktive Sachverständige, dynamisch summiert — statt einer hardcodierten Zahl.
// null = DB nicht erreichbar → Claim ohne Zahl (kein Fake-Wert).
async function getNetzwerkGroesse(): Promise<number | null> {
  try {
    const supabase = createAdminClient()
    const [leadsRes, svRes] = await Promise.all([
      supabase.from('sv_leads').select('id', { count: 'exact', head: true }),
      supabase.from('sachverstaendige').select('id', { count: 'exact', head: true }).eq('ist_aktiv', true),
    ])
    if (leadsRes.count == null || svRes.count == null) return null
    return leadsRes.count + svRes.count
  } catch {
    return null
  }
}

export default async function GutachterPartnerPage() {
  const [netzwerk, t] = await Promise.all([
    getNetzwerkGroesse(),
    getTranslations('gutachter_partner'),
  ])

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          organizationSchema(),
          serviceSchema({
            name: 'Claimondo SV-Partner-Netzwerk',
            description: `Kfz-Sachverständige tragen sich in das Claimondo-Netzwerk ein und erhalten Aufträge direkt ohne Eigenakquise.${netzwerk ? ` ${netzwerk} Sachverständige im bundesweiten Netzwerk.` : ' Bundesweites Netzwerk.'}`,
            url: `${GUTACHTER_LANDING_URL}/`,
          }),
          faqPageSchema(PARTNER_FAQ, {
            dateModified: getRouteLastUpdatedISO('/gutachter-partner'),
            url: '/gutachter-partner',
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: SITE_URL },
            { name: 'Sachverständiger werden', url: `${GUTACHTER_LANDING_URL}/` },
          ]),
        ])}
      />
      <h1 className="sr-only">
        {t('sr_h1')}
      </h1>
      <GutachterPartnerClient />
      <PartnerContent netzwerk={netzwerk} />
      <PartnerFooter />
    </>
  )
}
