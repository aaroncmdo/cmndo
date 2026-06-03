import type { Metadata } from 'next'

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
  },
}

export default function GutachterPartnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
