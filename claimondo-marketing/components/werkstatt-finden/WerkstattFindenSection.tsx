'use client'

// #18 P4: „Werkstatt finden"-Section — dünner Wrapper um die generische EmbedFinderSection
// (Consent-Bridge + Click-ID-Durchreiche geteilt mit dem Gutachter-Finder). Bettet den
// Haupt-App-Embed app.claimondo.de/embed/werkstatt-finder ein (Karte + 4-Schritt-Wizard).

import { EmbedFinderSection, type EmbedFinderSectionProps } from '@/components/embed-finder/EmbedFinderSection'

type Props = Omit<EmbedFinderSectionProps, 'embedPath' | 'title'>

export function WerkstattFindenSection(props: Props) {
  return (
    <EmbedFinderSection
      embedPath="/embed/werkstatt-finder"
      title="Kfz-Werkstatt in Ihrer Nähe finden"
      {...props}
    />
  )
}
