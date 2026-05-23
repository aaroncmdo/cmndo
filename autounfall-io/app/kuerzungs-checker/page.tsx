import type { Metadata } from 'next'
import { JsonLd } from '@/components/JsonLd'
import { siteGraph, toolGraph } from '@/lib/jsonld'
import { ToolPageHeader } from '@/components/tools/ToolPageHeader'
import { KuerzungsChecker } from '@/components/tools/KuerzungsChecker'

export const metadata: Metadata = {
  title: 'Kürzungs-Checker: Was die Versicherung gestrichen hat zurückholen',
  description:
    'Hat die Versicherung gekürzt? In drei Schritten zeigt der Kürzungs-Checker, welche Positionen Ihnen nach BGH zustehen und welcher Weg sie zurückholt.',
  alternates: { canonical: '/kuerzungs-checker' },
}

export default function KuerzungsCheckerPage() {
  return (
    <>
      <JsonLd
        data={siteGraph(
          toolGraph({
            slug: 'kuerzungs-checker',
            name: 'Kürzungs-Checker',
            description:
              'Decision-Tree-Tool zur Prüfung, was bei einer Versicherungs-Kürzung noch zurückgeholt werden kann.',
          }),
        )}
      />
      <div className="container-prose px-4 pb-16 pt-10 sm:px-0 lg:pt-14">
        <ToolPageHeader
          eyebrow="Kostenloses Tool"
          title="Kürzungs-Checker"
          intro="Die gegnerische Versicherung hat Positionen gestrichen oder gekürzt? Wählen Sie aus, was betroffen ist und in welcher Situation Sie stecken — der Checker zeigt den richtigen nächsten Schritt."
        />
        <KuerzungsChecker />
      </div>
    </>
  )
}
