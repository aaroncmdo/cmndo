import type { Metadata } from 'next'
import { JsonLd } from '@/components/JsonLd'
import { siteGraph, toolGraph } from '@/lib/jsonld'
import { ToolPageHeader } from '@/components/tools/ToolPageHeader'
import { UnfallberichtTool } from '@/components/tools/UnfallberichtTool'

export const metadata: Metadata = {
  title: 'Unfallbericht-Vorlage: ausfüllen, drucken, als PDF speichern',
  description:
    'Interaktiver Unfallbericht nach dem Europäischen Unfallbericht — mit Feld-Anleitung, lokal in Ihrem Browser, drucken oder als PDF speichern. Kein Schuldanerkenntnis.',
  alternates: { canonical: '/unfallbericht' },
}

export default function UnfallberichtPage() {
  return (
    <>
      <JsonLd
        data={siteGraph(
          toolGraph({
            slug: 'unfallbericht',
            name: 'Interaktiver Unfallbericht',
            description:
              'Europäischer-Unfallbericht-Formular mit Feld-Anleitung, lokaler Speicherung und Druck/PDF-Export.',
          }),
        )}
      />
      <div className="container-prose px-4 pb-16 pt-10 sm:px-0 lg:pt-14">
        <ToolPageHeader
          eyebrow="Kostenloses Tool"
          title="Interaktiver Unfallbericht"
          intro="Halten Sie den Unfallhergang sauber fest — mit Anleitung an jedem Feld. Die Eingaben bleiben nur lokal auf Ihrem Gerät; am Ende drucken oder als PDF speichern."
        />
        <UnfallberichtTool />
      </div>
    </>
  )
}
