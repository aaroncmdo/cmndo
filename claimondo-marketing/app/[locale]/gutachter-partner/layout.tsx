import type { Metadata } from 'next'
import { OG_DEFAULT_IMAGES } from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Gutachter werden — Claimondo Partner-Netzwerk',
  description:
    'Werden Sie Teil des führenden KFZ-Gutachter-Netzwerks Deutschlands. Mehr Aufträge, weniger Verwaltung, faire Abrechnung. Jetzt bewerben.',
  openGraph: {
    title: 'Gutachter werden — Claimondo Partner-Netzwerk',
    description:
      'Mehr Aufträge. Weniger Verwaltung. Volle Kontrolle. Das Claimondo-Netzwerk für unabhängige KFZ-Sachverständige.',
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    // Auch ein ZWISCHEN-Layout ersetzt den openGraph-Block des Root-Layouts
    // komplett (Next merged `metadata` flach). Aktuell folgenlos, weil jede
    // Seite unter /gutachter-partner einen eigenen Block MIT images setzt —
    // aber die naechste neue Unterseite ohne eigenen Block haette kein
    // Vorschaubild. Vom check:metadata-merge-Gate gefunden.
    images: OG_DEFAULT_IMAGES,
  },
}

export default function GutachterPartnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
