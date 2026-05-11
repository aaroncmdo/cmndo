// Server-Komponente fuer die 4 Legal-Routes (/agb /datenschutz /impressum
// /nutzungsbedingungen). Liest den Markdown via getLegalDoc und reicht
// ihn an die Markdown-Render-Inseln durch.
//
// Das eigentliche Rendering passiert via LegalDocPopover-Container — wir
// teilen damit eine Render-Logik zwischen Page-Variante und Popover-Variante.

import PageHeader from '@/components/shared/PageHeader'
import { getLegalDoc, type LegalDocSlug } from '@/lib/legal/get-doc'
import LegalDocBody from './LegalDocBody'

export default function LegalDocPage({ slug }: { slug: LegalDocSlug }) {
  const doc = getLegalDoc(slug)
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 font-[family-name:var(--font-montserrat)]">
      <div className="mb-8">
        <PageHeader title={doc.titel} size="lg" />
      </div>
      <article className="text-sm text-claimondo-navy">
        <LegalDocBody markdown={doc.markdown} />
      </article>
    </main>
  )
}
