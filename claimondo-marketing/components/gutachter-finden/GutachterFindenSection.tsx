'use client'

// Dünner Wrapper um die generische EmbedFinderSection (#18 P4: Logik extrahiert, damit
// Gutachter- und Werkstatt-Finder die Consent-Bridge + Click-ID-Durchreiche teilen).
// API unverändert — bestehende Konsumenten (gutachter-finden-Page, Landing-Sections)
// bleiben unberührt.

import { EmbedFinderSection, type EmbedFinderSectionProps } from '@/components/embed-finder/EmbedFinderSection'

type Props = Omit<EmbedFinderSectionProps, 'embedPath' | 'title'>

export function GutachterFindenSection(props: Props) {
  return (
    <EmbedFinderSection
      embedPath="/embed/gutachter-finder"
      title="Kfz-Gutachter in Ihrer Nähe finden"
      {...props}
    />
  )
}
