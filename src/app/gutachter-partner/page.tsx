import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  serviceSchema, breadcrumbsSchema, organizationSchema, faqPageSchema,
  jsonLdScript, GUTACHTER_LANDING_URL, SITE_URL,
} from '@/lib/seo/jsonld'
import GutachterPartnerClient from './GutachterPartnerClient'
import { PartnerContent, PARTNER_FAQ } from '@/components/gutachter-partner/PartnerContent'
import { PartnerFooter } from '@/components/gutachter-partner/PartnerFooter'

export const revalidate = 3600 // Warteliste-Zahl 1× pro Stunde aktualisieren

export const metadata: Metadata = {
  title: 'Als Kfz-Sachverständiger Partner werden — Warteliste',
  description:
    'Jetzt auf die Warteliste setzen: Bundesweites SV-Netzwerk von Claimondo. Aufträge direkt vermittelt, ohne Akquise. DAT-Experten, BVSK-Mitglieder und IHK-zertifizierte Gutachter willkommen.',
  keywords: [
    'Kfz-Sachverständiger werden',
    'SV-Netzwerk beitreten',
    'Gutachter Aufträge',
    'DAT-Experte Partner',
    'BVSK Partner',
    'Claimondo SV-Partner',
    'Kfz-Gutachter selbstständig',
    'Aufträge Sachverständiger',
    'Partner werden Sachverständiger',
  ],
  alternates: {
    canonical: `${GUTACHTER_LANDING_URL}/`,
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${GUTACHTER_LANDING_URL}/`,
    title: 'Als Kfz-Sachverständiger Partner werden — Claimondo',
    description:
      'Aufträge ohne Akquise. Tragen Sie sich in das Claimondo SV-Netzwerk ein — wir vermitteln direkt in Ihrem Einzugsgebiet.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Als Kfz-Sachverständiger Partner werden — Claimondo',
    description:
      'Aufträge ohne Akquise. Tragen Sie sich in das Claimondo SV-Netzwerk ein.',
  },
}

async function getWartelisteAnzahl(): Promise<number> {
  try {
    const supabase = createAdminClient()
    const { count } = await supabase
      .from('sv_leads')
      .select('id', { count: 'exact', head: true })
    return count ?? 62
  } catch {
    return 62 // Fallback bei DB-Fehler — Zahl vom 13.05.2026
  }
}

export default async function GutachterPartnerPage() {
  const warteliste = await getWartelisteAnzahl()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          organizationSchema(),
          serviceSchema({
            name: 'Claimondo SV-Partner-Netzwerk',
            description:
              'Kfz-Sachverständige tragen sich in das Claimondo-Netzwerk ein und erhalten Aufträge direkt ohne Eigenakquise. Über 89 DAT-Experten bundesweit.',
            url: `${GUTACHTER_LANDING_URL}/`,
          }),
          faqPageSchema(PARTNER_FAQ),
          breadcrumbsSchema([
            { name: 'Startseite', url: SITE_URL },
            { name: 'Sachverständiger werden', url: `${GUTACHTER_LANDING_URL}/` },
          ]),
        ])}
      />
      <h1 className="sr-only">
        Als Kfz-Sachverständiger Claimondo-Partner werden — Warteliste eintragen
      </h1>
      <GutachterPartnerClient />
      <PartnerContent warteliste={warteliste} />
      <PartnerFooter />
    </>
  )
}
